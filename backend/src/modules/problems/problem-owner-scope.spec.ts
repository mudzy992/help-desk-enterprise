import { ProblemsService } from './problems.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { problemOwnerEligibility } from './problem-owner-eligibility';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/priority/ticket-priority-matrix-configuration.loader', () => ({
  TicketPriorityMatrixConfigurationLoader: class TicketPriorityMatrixConfigurationLoader {},
}));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => null) }));
jest.mock('../tickets/resolve-ticket-priority', () => ({ resolveTicketPriority: jest.fn(async () => 'MEDIUM') }));
jest.mock('./problem-target', () => ({
  computeProblemTarget: jest.fn(async () => null),
  isTargetOverdue: jest.fn(() => false),
  isTargetRunning: jest.fn(() => true),
}));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));
// Only the exact check is doubled; the where-builder stays the real one.
jest.mock('./problem-owner-eligibility', () => ({
  ...jest.requireActual('./problem-owner-eligibility'),
  problemOwnerEligibility: jest.fn(),
}));

const viewer = { userId: 'u1' } as never;
const date = new Date('2026-11-17T09:00:00Z');
const eligibility = problemOwnerEligibility as jest.MockedFunction<typeof problemOwnerEligibility>;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sequence: 7,
    title: 'Štampač',
    description: 'Opis',
    status: 'INVESTIGATING',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
    urgency: 'MEDIUM',
    ownerUserId: 'u-owner',
    owner: { id: 'u-owner', displayName: 'Vlasnik', email: 'owner@example.com' },
    groupId: 'g1',
    group: { id: 'g1', name: 'Grupa A' },
    organizationalUnitId: 'ou1',
    organizationalUnit: { id: 'ou1', name: 'Jedinica A', ouPath: '/root/ou1' },
    serviceId: null,
    service: null,
    rootCauseCategory: null,
    rootCause: null,
    rcaWhys: null,
    workaround: null,
    workaroundAt: null,
    resolution: null,
    knowledgeArticleId: null,
    knowledgeArticle: null,
    identifiedAt: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: null,
    targetAt: null,
    targetRemindersSent: [],
    createdAt: date,
    updatedAt: date,
    version: 4,
    handoffs: [] as unknown[],
    ...overrides,
  };
}

function setup(options: { readonly stubGet?: boolean } = {}) {
  const current = row();
  const events: { action: string; detail: unknown }[] = [];
  const tx = {
    problem: { updateMany: jest.fn(async () => ({ count: 1 })) },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: { action: string; detail: unknown } }) => events.push(data)),
    },
  };
  const prisma = {
    ...tx,
    problem: { ...tx.problem, findFirst: jest.fn(async () => current) },
    problemTicket: { groupBy: jest.fn(async () => [{ problemId: 'p1', _count: { _all: 0 } }]) },
    user: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => ({
        id: 'u-owner',
        email: 'owner@example.com',
        displayName: 'Vlasnik',
        isActive: true,
        isLocalOnly: false,
        mustChangePassword: false,
        entraObjectId: null,
        directoryObjectGuid: null,
        authzVersion: 1,
        organizationalUnitId: 'ou1',
        anonymizedAt: null,
        organizationalUnit: { ouPath: '/root/ou1' },
        userRoles: [
          {
            id: 'assignment-1',
            role: { key: 'PROBLEM_MANAGER', rolePermissions: [{ permission: { key: 'problem.manage' } }] },
            organizationalUnit: { id: 'ou1', ouPath: '/root/ou1' },
            service: null,
          },
        ],
        groupMembers: [{ groupId: 'g1' }],
      })),
    },
    group: {
      findUnique: jest.fn(async () => ({ isProblemGroup: true, organizationalUnit: { ouPath: '/root/ou1' } })),
    },
    organizationalUnit: { findUnique: jest.fn(async () => ({ ouPath: '/root/ou1/child' })) },
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', rootCauseCategories: ['SW'], requireWorkaroundForKnownError: false })),
    requireGroupAuthority: jest.fn(async () => undefined),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou1', ouPath: '/root/ou1', name: 'Jedinica A' })),
    hasGroupAuthority: jest.fn(async () => true),
    hasPermission: jest.fn(() => true),
    scopeOf: jest.fn(async () => ({ all: true, paths: [] })),
  };
  const service = new ProblemsService(prisma as never, access as never, {} as never, {} as never, {} as never);
  if (options.stubGet !== false) jest.spyOn(service, 'get').mockResolvedValue({ id: 'p1' } as never);
  return { service, prisma, access, events };
}

/**
 * W7.33 / BA-problems-15: an owner is a manager of *this* group and *this* unit.
 * The write path asks the exact check, and it is told which unit to ask about.
 */
describe('ProblemsService owner eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eligibility.mockResolvedValue({ eligible: true, reason: null });
  });

  it('binds the owner check to the problem group and the problem unit', async () => {
    const { service, prisma } = setup();
    await service.update(viewer, 'p1', { version: 4, ownerUserId: 'u-other' } as never);

    expect(eligibility).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u-other',
      groupId: 'g1',
      unitPath: '/root/ou1',
    });
    expect(prisma.problem.updateMany).toHaveBeenCalled();
  });

  it('refuses an owner whose grant does not cover the problem unit', async () => {
    eligibility.mockResolvedValue({ eligible: false, reason: 'out_of_scope' });
    const { service, prisma } = setup();

    await expect(service.update(viewer, 'p1', { version: 4, ownerUserId: 'u-other' } as never)).rejects.toMatchObject({
      code: problemErrorCodes.ownerNotInGroup,
    });
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a former member or a revoked manager as well', async () => {
    for (const reason of ['not_member', 'not_manager', 'inactive'] as const) {
      eligibility.mockResolvedValue({ eligible: false, reason });
      const { service } = setup();
      await expect(service.update(viewer, 'p1', { version: 4, ownerUserId: 'u-other' } as never)).rejects.toBeInstanceOf(ProblemError);
    }
  });

  it('keeps the current owner when the update rewrites another field', async () => {
    const { service } = setup();
    await service.update(viewer, 'p1', { version: 4, title: 'Novi naslov' } as never);
    expect(eligibility).not.toHaveBeenCalled();
  });

  it('scopes the owner picker by the group unit and never drops the text filter', async () => {
    const { service, prisma } = setup();
    await service.searchOwners(viewer, 'ana', 'g1');

    const args = (prisma.user.findMany as jest.Mock).mock.calls[0][0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    expect(args.where.AND).toHaveLength(2);
    const scope = args.where.AND[0] as {
      groupMembers: unknown;
      userRoles: { some: { OR: Array<{ AND: Array<Record<string, unknown>> }> } };
    };
    expect(scope.groupMembers).toEqual({ some: { groupId: 'g1' } });
    const unitBranch = scope.userRoles.some.OR[1]?.AND[1] as { organizationalUnit: { ouPath: { in: string[] } } };
    // The same strings the database stores, not a normalised copy of them.
    expect(unitBranch.organizationalUnit.ouPath.in).toEqual(['/root', '/root/ou1']);
    // The text search stays its own OR: a scope filter and a search must both hold.
    expect(args.where.AND[1]).toHaveProperty('OR');
  });

  it('answers an owner search without a group with an empty list', async () => {
    const { service, prisma } = setup();
    await expect(service.searchOwners(viewer, 'ana', null)).resolves.toEqual({ items: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('ProblemsService detail owner drift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eligibility.mockResolvedValue({ eligible: true, reason: null });
  });

  it('reports the recorded owner as eligible on the detail', async () => {
    const { service } = setup({ stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as { ownerEligibility: unknown };
    expect(detail.ownerEligibility).toEqual({ eligible: true, reason: null });
  });

  it('reports why a recorded owner is no longer eligible', async () => {
    eligibility.mockResolvedValue({ eligible: false, reason: 'not_member' });
    const { service } = setup({ stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as { ownerEligibility: unknown };
    expect(detail.ownerEligibility).toEqual({ eligible: false, reason: 'not_member' });
  });
});
