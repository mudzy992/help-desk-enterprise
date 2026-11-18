import { ChangeScheduleService } from './change-schedule.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scoped = { all: false as const, paths: ['/inside'] };
const globalScope = { all: true as const };

const from = '2030-05-01';
const to = '2030-05-20';

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

function buildService(scope: { all: true } | { all: false; paths: string[] } = scoped) {
  const prisma = {
    changeRequest: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    serviceDowntimeWindow: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
  };
  const access = {
    require: jest.fn(async () => scope),
    configuration: jest.fn(async () => configuration()),
  };
  const service = new ChangeScheduleService(prisma as never, access as never);
  return { prisma, access, service };
}

const unitVisibility = {
  OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }],
};

describe('change calendar downtime scope (BA-changes-05)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks only for downtime windows the reader may see', async () => {
    const { prisma, service } = buildService();

    const result = await service.calendar(viewer, from, to);

    const where = prisma.serviceDowntimeWindow.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.startsAt).toEqual({ lt: new Date(to) });
    expect(where.endsAt).toEqual({ gt: new Date(from) });
    // Hand-entered windows (no owner) stay public; change-owned ones follow the
    // same visibility predicate as the change list.
    expect(where.OR).toEqual([{ changeRequestId: null }, { changeRequest: { OR: expect.any(Array) } }]);
    const visibility = (where.OR as { changeRequest?: { OR: unknown[] } }[])[1]?.changeRequest;
    expect(visibility?.OR[0]).toEqual({ organizationalUnit: unitVisibility });
    expect(visibility?.OR).toContainEqual({ requesterUserId: 'user-1' });
    expect(result.restrictedDowntime).toBe(0);
  });

  it('counts the hidden change-owned windows instead of dropping them silently', async () => {
    const { prisma, service } = buildService();
    prisma.serviceDowntimeWindow.count.mockResolvedValueOnce(3);

    const result = await service.calendar(viewer, from, to);

    const countWhere = prisma.serviceDowntimeWindow.count.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(countWhere.changeRequestId).toEqual({ not: null });
    expect(countWhere.NOT).toEqual({ changeRequest: { OR: expect.any(Array) } });
    expect(result.restrictedDowntime).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('keeps every window and skips the extra count for a reader without a unit boundary', async () => {
    const { prisma, service } = buildService(globalScope);
    prisma.serviceDowntimeWindow.findMany.mockResolvedValueOnce([
      {
        id: 'window-1',
        startsAt: new Date('2030-05-02T08:00:00.000Z'),
        endsAt: new Date('2030-05-02T10:00:00.000Z'),
        message: 'Održavanje',
        changeRequestId: 'change-9',
        service: { id: 'service-1', name: 'Mreža' },
      },
    ]);

    const result = await service.calendar(viewer, from, to);

    const where = prisma.serviceDowntimeWindow.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.OR).toBeUndefined();
    expect(prisma.serviceDowntimeWindow.count).not.toHaveBeenCalled();
    expect(result.restrictedDowntime).toBe(0);
    expect(result.downtime[0]?.changeRequestId).toBe('change-9');
    expect(result.downtime[0]?.service).toEqual({ id: 'service-1', name: 'Mreža' });
  });
});
