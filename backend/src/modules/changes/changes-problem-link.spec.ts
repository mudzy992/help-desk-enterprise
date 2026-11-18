import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';
import { changeErrorCodes } from './changes.constants';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

const changeViewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scopedChangeScope = { all: false as const, paths: ['/inside'] };

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

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 7,
    title: 'Swap the switch',
    type: 'NORMAL',
    status: 'DRAFT',
    risk: 'MEDIUM',
    plannedStart: null,
    plannedEnd: null,
    causesDowntime: false,
    ownerUserId: null,
    requesterUserId: 'user-1',
    cabGroupId: null,
    organizationalUnitId: 'ou-inside',
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    owner: null,
    requester: { id: 'user-1', displayName: 'Requestor', email: 'requestor@example.test' },
    cabGroup: null,
    organizationalUnit: { id: 'ou-inside', name: 'Inside', ouPath: '/inside' },
    services: [],
    _count: { services: 1, assets: 0 },
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    description: 'Opis promjene',
    reason: 'Razlog',
    impact: 'MEDIUM',
    likelihood: 'MEDIUM',
    implementationPlan: null,
    backoutPlan: null,
    testPlan: null,
    communicationPlan: null,
    actualStart: null,
    actualEnd: null,
    outcome: null,
    reviewNotes: null,
    templateId: null,
    problemId: null,
    approvalRound: 1,
    conflictsAcknowledgedAt: null,
    submittedAt: null,
    authorizedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    template: null,
    problem: null,
    assets: [],
    ...overrides,
  };
}

type QueryArgs = Record<string, unknown>;

function buildService() {
  const prisma = {
    asset: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    organizationalUnit: { findUnique: jest.fn(async (_args: QueryArgs): Promise<unknown> => ({ ouPath: '/inside' })) },
    changeRequest: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      findFirst: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    changeRequestAsset: { groupBy: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    problem: {
      findFirst: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
    },
    group: {
      findFirst: jest.fn(async (_args: QueryArgs): Promise<unknown> => null),
      findUnique: jest.fn(async (_args: QueryArgs): Promise<unknown> => ({ isCabGroup: true })),
    },
    user: {
      count: jest.fn(async (_args: QueryArgs): Promise<number> => 0),
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
    },
    $transaction: jest.fn(async (_work: (tx: unknown) => unknown): Promise<unknown> => {
      throw new Error('transaction-reached');
    }),
  };
  const access = {
    require: jest.fn(async () => scopedChangeScope),
    configuration: jest.fn(async () => configuration()),
    cmdbEnabled: jest.fn(async () => false),
    problemsEnabled: jest.fn(async () => true),
    hasPermission: jest.fn((_viewer: unknown, permission: string) => permission === permissionKeys.problemRead),
    scopeOf: jest.fn(async () => scopedChangeScope),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou-inside', ouPath: '/inside', name: 'Inside' })),
    problemNumberPrefix: jest.fn(async () => 'PRB'),
  };
  const service = new ChangesService(prisma as never, access as never, {} as never, {} as never);
  jest.spyOn(service as unknown as { canManage: () => Promise<boolean> }, 'canManage').mockResolvedValue(false);
  jest.spyOn(service as unknown as { editScopeFor: () => Promise<'none'> }, 'editScopeFor').mockResolvedValue('none');
  jest.spyOn(service as unknown as { allowedActions: () => Promise<never[]> }, 'allowedActions').mockResolvedValue([]);
  return { prisma, access, service };
}

function principalMock(value: unknown): void {
  (loadPrincipalContext as jest.Mock).mockResolvedValue(value);
}

const createInput = {
  type: 'NORMAL' as const,
  title: 'Promjena zbog problema',
  description: 'Planirano rješenje',
  organizationalUnitId: 'ou-inside',
  cabGroupId: 'cab-1',
  problemId: 'problem-1',
};

describe('change problem link (BA-changes-03)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('repeats the register visibility on a direct problem id', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.problemRead]));
    const { prisma, service } = buildService();
    prisma.problem.findFirst.mockResolvedValueOnce(null);

    await expect(service.create(changeViewer, { ...createInput })).rejects.toMatchObject({
      code: changeErrorCodes.problemNotFound,
    });

    const where = prisma.problem.findFirst.mock.calls[0]?.[0]?.where as { AND: unknown[] };
    expect(where.AND[0]).toEqual({ id: 'problem-1' });
    // problemVisibilityWhere(scope, userId) — the same predicate as the register.
    expect(where.AND[1]).toEqual({
      organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] },
    });
  });

  it('fails closed when the viewer has no problem.read grant', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]));
    const { prisma, access, service } = buildService();
    access.hasPermission.mockReturnValue(false);

    await expect(service.create(changeViewer, { ...createInput })).rejects.toMatchObject({
      code: changeErrorCodes.problemNotFound,
    });
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
    expect(access.hasPermission).toHaveBeenCalledWith(changeViewer, permissionKeys.problemRead);
  });

  it('refuses a closed problem with its own code instead of hiding it', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.problemRead]));
    const { prisma, service } = buildService();
    prisma.problem.findFirst.mockResolvedValueOnce({ status: 'CLOSED' });

    await expect(service.create(changeViewer, { ...createInput })).rejects.toMatchObject({
      code: changeErrorCodes.problemClosed,
      detail: 'CLOSED',
    });
  });

  it('refuses a cancelled problem the same way', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.problemRead]));
    const { prisma, service } = buildService();
    prisma.problem.findFirst.mockResolvedValueOnce({ status: 'CANCELLED' });

    await expect(service.create(changeViewer, { ...createInput })).rejects.toMatchObject({
      code: changeErrorCodes.problemClosed,
    });
  });

  it('accepts an open, readable problem', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.problemRead]));
    const { prisma, service } = buildService();
    prisma.problem.findFirst.mockResolvedValueOnce({ status: 'INVESTIGATING' });

    // The sentinel proves the link check passed before the write transaction.
    await expect(service.create(changeViewer, { ...createInput })).rejects.toThrow('transaction-reached');
  });

  it('does not re-validate an unchanged problem when only the title changes', async () => {
    principalMock(principalOf([permissionKeys.changeRequest, permissionKeys.changeRead, permissionKeys.problemRead]));
    const { prisma, service } = buildService();
    prisma.changeRequest.findFirst.mockResolvedValue(
      detailRow({
        problemId: 'problem-1',
        problem: { id: 'problem-1', sequence: 3, title: 'Prekid rada', status: 'CLOSED' },
      }),
    );
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (work: (tx: unknown) => unknown) =>
      work({
        changeRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
        changeRequestService: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn(async () => ({ count: 0 })) },
        changeRequestAsset: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn(async () => ({ count: 0 })) },
        changeEvent: { create: jest.fn(async () => undefined) },
      }),
    );
    jest.spyOn(service as unknown as { editScopeFor: () => Promise<'full'> }, 'editScopeFor').mockResolvedValue('full');

    await service.update(changeViewer, 'change-1', { version: 1, title: 'Novi naslov' });

    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });

  describe('read projection', () => {
    it('hides a problem the viewer may not read', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.problemRead]));
      const { prisma, service } = buildService();
      prisma.changeRequest.findFirst.mockResolvedValueOnce(
        detailRow({ problemId: 'problem-1', problem: { id: 'problem-1', sequence: 3, title: 'Prekid rada', status: 'KNOWN_ERROR' } }),
      );
      prisma.problem.count.mockResolvedValueOnce(0);

      const detail = await service.get(changeViewer, 'change-1');

      expect(detail.problem).toBeNull();
      expect(JSON.stringify(detail)).not.toContain('Prekid rada');
    });

    it('shows a readable problem with its number', async () => {
      principalMock(principalOf([permissionKeys.changeRead, permissionKeys.problemRead]));
      const { service, prisma } = buildService();
      prisma.changeRequest.findFirst.mockResolvedValueOnce(
        detailRow({ problemId: 'problem-1', problem: { id: 'problem-1', sequence: 3, title: 'Prekid rada', status: 'KNOWN_ERROR' } }),
      );
      prisma.problem.count.mockResolvedValueOnce(1);

      const detail = await service.get(changeViewer, 'change-1');

      expect(detail.problem).toEqual({ id: 'problem-1', number: 'PRB000003', title: 'Prekid rada', status: 'KNOWN_ERROR' });
    });
  });
});
