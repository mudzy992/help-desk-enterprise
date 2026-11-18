import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeScheduleService } from './change-schedule.service';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scoped = { all: false as const, paths: ['/inside'] };
const globalScope = { all: true as const };

const windowStart = new Date('2030-05-01T10:00:00.000Z');
const windowEnd = new Date('2030-05-01T12:00:00.000Z');

function configuration() {
  return {
    numberPrefix: 'CHG',
    normalQuorum: 1,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: 'UTC',
  };
}

function candidate(id: string, title: string) {
  return {
    id,
    sequence: id === 'change-in' ? 11 : 12,
    title,
    status: 'SCHEDULED',
    plannedStart: windowStart,
    plannedEnd: windowEnd,
    services: [{ serviceId: 'service-1' }],
    assets: [],
  };
}

function principalOf(permissions: readonly string[]) {
  return {
    subjectId: 'user-1',
    isActive: true,
    homeOrganizationalUnitId: null,
    assignments: [{
      roleKey: 'AGENT',
      permissionKeys: [...permissions],
      organizationalUnitId: 'ou-inside',
      organizationalUnitPath: '/inside',
      serviceId: null,
    }],
  };
}

function buildService(scope: { all: true } | { all: false; paths: string[] } = scoped) {
  const prisma = {
    changeRequest: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    service: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => [{ id: 'service-1', name: 'Mreža' }]) },
    serviceDowntimeWindow: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    asset: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    organizationalUnit: { findUnique: jest.fn(async (_args: QueryArgs): Promise<unknown> => ({ ouPath: '/inside' })) },
  };
  const access = {
    require: jest.fn(async () => scope),
    configuration: jest.fn(async () => configuration()),
  };
  const service = new ChangeScheduleService(prisma as never, access as never);
  return { prisma, access, service };
}

/** The visibility query `readableChangeIds` issues is the only one selecting just an id. */
function routeVisibilityQuery(
  prisma: ReturnType<typeof buildService>['prisma'],
  readableIds: readonly string[],
): void {
  prisma.changeRequest.findMany.mockImplementation(async (args: QueryArgs) => {
    const select = args.select as QueryArgs | undefined;
    if (select !== undefined && Object.keys(select).length === 1 && select.id === true) {
      return readableIds.map((id) => ({ id }));
    }
    return [];
  });
}

const previewInput = {
  type: 'NORMAL' as const,
  plannedStart: windowStart.toISOString(),
  plannedEnd: windowEnd.toISOString(),
  serviceIds: ['service-1'],
};

describe('change conflict preview (BA-changes-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRead, permissionKeys.changeRequest, permissionKeys.assetRead]),
    );
  });

  it('describes only the readers own conflicts and counts the rest', async () => {
    const { prisma, service } = buildService();
    prisma.changeRequest.findMany.mockImplementation(async (args: QueryArgs) => {
      const select = args.select as QueryArgs | undefined;
      if (select !== undefined && Object.keys(select).length === 1 && select.id === true) {
        return [{ id: 'change-in' }];
      }
      return [candidate('change-in', 'Moj prekid'), candidate('change-out', 'Tuđi prekid')];
    });

    const result = await service.preview(viewer, { ...previewInput });

    expect(result.changes.map((item) => item.id)).toEqual(['change-in']);
    expect(result.restricted).toEqual({ changes: 1, downtime: 0 });
    expect(result.hasWarnings).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Tuđi prekid');
    // The visibility set is resolved with the same predicate as the register.
    const visibilityCall = prisma.changeRequest.findMany.mock.calls.find((call) => {
      const select = (call[0] as QueryArgs).select as QueryArgs | undefined;
      return select !== undefined && Object.keys(select).length === 1 && select.id === true;
    });
    const where = (visibilityCall?.[0] as QueryArgs).where as { AND: unknown[] };
    expect(where.AND[0]).toEqual({
      OR: [
        { organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] } },
        { requesterUserId: 'user-1' },
        { ownerUserId: 'user-1' },
        { cabGroup: { members: { some: { userId: 'user-1' } } } },
      ],
    });
    expect(where.AND[1]).toEqual({ id: { in: ['change-in', 'change-out'] } });
  });

  it('keeps the whole list for a viewer without a unit boundary', async () => {
    const { prisma, service } = buildService(globalScope);
    prisma.changeRequest.findMany.mockResolvedValue([
      candidate('change-in', 'Moj prekid'),
      candidate('change-out', 'Tuđi prekid'),
    ]);

    const result = await service.preview(viewer, { ...previewInput });

    expect(result.changes.map((item) => item.id)).toEqual(['change-in', 'change-out']);
    expect(result.restricted).toEqual({ changes: 0, downtime: 0 });
    // No visibility query at all: every unit is readable.
    const idOnlyQueries = prisma.changeRequest.findMany.mock.calls.filter((call) => {
      const select = (call[0] as QueryArgs).select as QueryArgs | undefined;
      return select !== undefined && Object.keys(select).length === 1 && select.id === true;
    });
    expect(idOnlyQueries).toHaveLength(0);
  });

  it('hides downtime windows of changes the viewer cannot read', async () => {
    const { prisma, service } = buildService();
    routeVisibilityQuery(prisma, ['change-in']);
    prisma.serviceDowntimeWindow.findMany.mockResolvedValue([
      { id: 'window-free', serviceId: 'service-1', startsAt: windowStart, endsAt: windowEnd, message: 'Redovno održavanje', changeRequestId: null },
      { id: 'window-foreign', serviceId: 'service-1', startsAt: windowStart, endsAt: windowEnd, message: 'Tuđi prekid', changeRequestId: 'change-out' },
    ]);

    const result = await service.preview(viewer, { ...previewInput });

    expect(result.downtime.map((item) => item.id)).toEqual(['window-free']);
    expect(result.restricted).toEqual({ changes: 0, downtime: 1 });
    expect(JSON.stringify(result)).not.toContain('Tuđi prekid');
  });

  it('drops asset references the viewer may not read before the engine sees them', async () => {
    const { prisma, service } = buildService();
    routeVisibilityQuery(prisma, []);
    prisma.asset.findMany.mockResolvedValue([]);

    await service.preview(viewer, { ...previewInput, assetIds: ['asset-foreign'] });

    const assetWhere = prisma.asset.findMany.mock.calls[0]?.[0]?.where as { AND: unknown[] };
    expect(assetWhere.AND[0]).toEqual({
      organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] },
    });
    expect(assetWhere.AND[1]).toEqual({ id: { in: ['asset-foreign'] } });
    // No readable asset remains, so the candidate query only used the service.
    const candidateCall = prisma.changeRequest.findMany.mock.calls.find((call) => {
      const select = (call[0] as QueryArgs).select as QueryArgs | undefined;
      return select !== undefined && Object.keys(select).length > 1;
    });
    const or = ((candidateCall?.[0] as QueryArgs).where as { OR: unknown[] }).OR;
    expect(or).toEqual([{ services: { some: { serviceId: { in: ['service-1'] } } } }]);
  });

  it('does not let a foreign change id hide a real conflict', async () => {
    const { prisma, service } = buildService();
    prisma.changeRequest.findMany.mockImplementation(async (args: QueryArgs) => {
      const select = args.select as QueryArgs | undefined;
      if (select !== undefined && Object.keys(select).length === 1 && select.id === true) return [];
      return [candidate('change-out', 'Tuđi prekid')];
    });
    // The viewer cannot read the submitted change id, so it is not trusted.
    prisma.changeRequest.count.mockResolvedValue(0);

    const result = await service.preview(viewer, { ...previewInput, changeId: 'change-out' });

    expect(result.changes).toEqual([]);
    expect(result.restricted).toEqual({ changes: 1, downtime: 0 });
  });
});
