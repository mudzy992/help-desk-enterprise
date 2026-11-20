import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';
import { changeErrorCodes } from './changes.constants';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

const changeViewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scope = { all: false as const, paths: ['/Skupina/Regija/Site'] };

function principalOf(permissions: readonly string[]) {
  return {
    subjectId: 'user-1',
    isActive: true,
    homeOrganizationalUnitId: null,
    assignments: [{
      roleKey: 'AGENT',
      permissionKeys: [...permissions],
      organizationalUnitId: 'ou-site',
      organizationalUnitPath: '/Skupina/Regija/Site',
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

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 3,
    title: 'Zamjena preklopnika',
    description: 'Plan',
    reason: 'Razlog',
    type: 'NORMAL',
    status: 'DRAFT',
    risk: 'MEDIUM',
    impact: 'MEDIUM',
    likelihood: 'MEDIUM',
    plannedStart: null,
    plannedEnd: null,
    causesDowntime: false,
    ownerUserId: null,
    requesterUserId: 'user-1',
    cabGroupId: 'cab-site',
    organizationalUnitId: 'ou-site',
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
    attachments: [],
    approvals: [],
    events: [],
    services: [],
    owner: null,
    requester: { id: 'user-1', displayName: 'Tražilac', email: 'trazilac@example.test' },
    cabGroup: { id: 'cab-site', name: 'CAB Site' },
    organizationalUnit: { id: 'ou-site', name: 'Site', ouPath: '/Skupina/Regija/Site' },
    _count: { services: 0, assets: 0 },
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * `group.findMany` is answered per ancestor path, so a test describes the
 * installation ("this level owns these CAB groups") instead of the call order.
 */
function buildService(cabGroupsByOuPath: Record<string, readonly string[]>, outsideUnit: readonly string[] = []) {
  const created: Record<string, unknown>[] = [];
  const auditCalls: Record<string, unknown>[] = [];
  const prisma = {
    organizationalUnit: {
      findUnique: jest.fn(async () => ({ ouPath: '/Skupina/Regija/Site' })),
    },
    service: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    group: {
      findMany: jest.fn(async (args: { where?: { organizationalUnit?: { ouPath?: string } } }) => {
        const path = args?.where?.organizationalUnit?.ouPath;
        if (path === undefined) return outsideUnit.map((id) => ({ id }));
        return (cabGroupsByOuPath[path] ?? []).slice(0, 2).map((id) => ({ id }));
      }),
      findUnique: jest.fn(async () => ({ isCabGroup: true })),
    },
    changeRequest: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: 'change-1' };
      }),
      findFirst: jest.fn(async () => detailRow()),
      findMany: jest.fn(async () => []),
    },
    changeRequestAsset: { groupBy: jest.fn(async () => []) },
    asset: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => [{ lastNumber: 3 }]),
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) =>
      work({
        $queryRaw: jest.fn(async () => [{ lastNumber: 3 }]),
        changeRequest: {
          create: jest.fn(async (args: { data: Record<string, unknown> }) => {
            created.push(args.data);
            return { id: 'change-1' };
          }),
        },
        changeEvent: { create: jest.fn(async () => undefined) },
      }),
    ),
  };
  const access = {
    require: jest.fn(async () => scope),
    configuration: jest.fn(async () => configuration()),
    cmdbEnabled: jest.fn(async () => false),
    problemsEnabled: jest.fn(async () => false),
    hasPermission: jest.fn((_viewer: unknown, permission: string) => permission === permissionKeys.changeRead),
    scopeOf: jest.fn(async () => scope),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou-site', ouPath: '/Skupina/Regija/Site', name: 'Site' })),
  };
  const service = new ChangesService(prisma as never, access as never, {} as never, {} as never);
  jest.spyOn(service as unknown as { canManage: () => Promise<boolean> }, 'canManage').mockResolvedValue(false);
  jest.spyOn(service as unknown as { editScopeFor: () => Promise<'none'> }, 'editScopeFor').mockResolvedValue('none');
  jest.spyOn(service as unknown as { allowedActions: () => Promise<never[]> }, 'allowedActions').mockResolvedValue([]);
  // `recordAuditEntry(client, entry)` - the first argument is the transaction.
  (recordAuditEntry as jest.Mock).mockImplementation(
    async (_client: unknown, entry: Record<string, unknown>) => {
      auditCalls.push(entry);
    },
  );
  return { prisma, access, service, created, auditCalls };
}

const baseInput = {
  type: 'NORMAL' as const,
  title: 'Zamjena preklopnika',
  description: 'Planirani rad',
  organizationalUnitId: 'ou-site',
};

describe('CAB routing on change creation (BA-changes-16)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes to the only CAB group of the change unit and records the origin', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { service, created, auditCalls } = buildService({
      '/Skupina/Regija/Site': ['cab-site'],
      '/Skupina': ['cab-root-a', 'cab-root-b'],
    });

    await service.create(changeViewer, { ...baseInput });

    expect(created[0]?.cabGroupId).toBe('cab-site');
    expect(auditCalls[0]).toMatchObject({
      action: auditLogActions.changeCreated,
      metadata: { cabGroupId: 'cab-site', cabRouting: 'single-covering' },
    });
  });

  it('prefers the nearest ancestor over the alphabetical first group', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    // "A-root" sorts first, but the branch next to the change owns the routing.
    const { service, created } = buildService({ '/Skupina/Regija': ['z-branch'] });

    await service.create(changeViewer, { ...baseInput });

    expect(created[0]?.cabGroupId).toBe('z-branch');
  });

  it('refuses to pick when the unit level has several CAB groups', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { service, prisma } = buildService({ '/Skupina/Regija/Site': ['cab-a', 'cab-b'] });

    await expect(service.create(changeViewer, { ...baseInput })).rejects.toMatchObject({
      code: changeErrorCodes.cabGroupRequired,
      detail: 'cabGroupId',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to pick when the chain is empty and the installation has several CAB groups', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { service } = buildService({}, ['cab-x', 'cab-y']);

    await expect(service.create(changeViewer, { ...baseInput })).rejects.toMatchObject({
      code: changeErrorCodes.cabGroupRequired,
    });
  });

  it('uses the only CAB group of the installation when the unit chain has none', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { service, created, auditCalls } = buildService({}, ['cab-only']);

    await service.create(changeViewer, { ...baseInput });

    expect(created[0]?.cabGroupId).toBe('cab-only');
    expect(auditCalls[0]).toMatchObject({ metadata: { cabRouting: 'single-installation' } });
  });

  it('keeps an explicit choice and never re-routes it', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { service, created, prisma } = buildService({ '/Skupina/Regija/Site': ['cab-site'] });

    await service.create(changeViewer, { ...baseInput, cabGroupId: 'cab-central' });

    expect(created[0]?.cabGroupId).toBe('cab-central');
    // The resolver is not consulted for an explicit id, so no level is read.
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('leaves a standard change without a CAB group', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(
      principalOf([permissionKeys.changeRequest, permissionKeys.changeRead]),
    );
    const { prisma } = buildService({ '/Skupina/Regija/Site': ['cab-site'] });
    (prisma as unknown as { changeTemplate: unknown }).changeTemplate = {
      findUnique: jest.fn(async () => ({
        isActive: true,
        description: 'Šablon',
        implementationPlan: null,
        backoutPlan: null,
        testPlan: null,
        impact: 'LOW',
        likelihood: 'LOW',
        causesDowntime: false,
        services: [],
      })),
    };
    const service = new ChangesService(prisma as never, {
      require: jest.fn(async () => scope),
      configuration: jest.fn(async () => configuration()),
      cmdbEnabled: jest.fn(async () => false),
      problemsEnabled: jest.fn(async () => false),
      hasPermission: jest.fn((_viewer: unknown, permission: string) => permission === permissionKeys.changeRead),
      scopeOf: jest.fn(async () => scope),
      requireUnitInScope: jest.fn(async () => undefined),
    } as never, {} as never, {} as never);
    jest.spyOn(service as unknown as { canManage: () => Promise<boolean> }, 'canManage').mockResolvedValue(false);
    jest.spyOn(service as unknown as { editScopeFor: () => Promise<'none'> }, 'editScopeFor').mockResolvedValue('none');
    jest.spyOn(service as unknown as { allowedActions: () => Promise<never[]> }, 'allowedActions').mockResolvedValue([]);
    const created: Record<string, unknown>[] = [];
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (work: (tx: unknown) => unknown) =>
      work({
        $queryRaw: jest.fn(async () => [{ lastNumber: 4 }]),
        changeRequest: {
          create: jest.fn(async (args: { data: Record<string, unknown> }) => {
            created.push(args.data);
            return { id: 'change-2' };
          }),
        },
        changeEvent: { create: jest.fn(async () => undefined) },
      }),
    );

    await service.create(changeViewer, { ...baseInput, type: 'STANDARD', templateId: 'template-1' });

    expect(created[0]?.cabGroupId).toBeNull();
  });
});
