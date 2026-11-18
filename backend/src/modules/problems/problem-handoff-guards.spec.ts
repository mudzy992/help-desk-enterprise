import { ProblemsService } from './problems.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

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

const viewer = { userId: 'u1' } as never;
const date = new Date('2026-11-17T09:00:00Z');

const pendingHandoff = {
  id: 'h1',
  status: 'PENDING',
  reason: 'Problem pripada drugoj grupi',
  createdAt: date,
  requestedByUserId: 'u1',
  toGroupId: 'g2',
  toGroup: { id: 'g2', name: 'Grupa B' },
  toOrganizationalUnit: { id: 'ou2', name: 'Jedinica B', ouPath: '/root/ou2' },
  requestedBy: { id: 'u1', displayName: 'Ana', email: 'ana@example.com' },
};

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

function setup(options: {
  current?: Record<string, unknown>;
  unitPath?: string;
  canDecide?: boolean;
  status?: string;
  cancelCount?: number;
  stubGet?: boolean;
} = {}) {
  const current = row(options.current);
  const events: { action: string; detail: unknown }[] = [];
  const handoffUpdates: Record<string, unknown>[] = [];
  const tx = {
    problem: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: { action: string; detail: unknown } }) => events.push(data)),
    },
    problemHandoff: {
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        handoffUpdates.push(data);
        return { count: options.cancelCount ?? 0 };
      }),
    },
  };
  const prisma = {
    ...tx,
    problem: { ...tx.problem, findFirst: jest.fn(async () => current) },
    problemTicket: { groupBy: jest.fn(async () => [{ problemId: 'p1', _count: { _all: 0 } }]) },
    user: {
      findMany: jest.fn(async () => []),
      // W7.33: the detail resolves the recorded owner through the principal loader.
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
    organizationalUnit: { findUnique: jest.fn(async () => ({ ouPath: options.unitPath ?? '/root/ou1/child' })) },
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', rootCauseCategories: ['SW'], requireWorkaroundForKnownError: false })),
    requireGroupAuthority: jest.fn(async () => undefined),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou1', ouPath: '/root/ou1', name: 'Jedinica A' })),
    hasGroupAuthority: jest.fn(async () => options.canDecide === true),
    hasPermission: jest.fn(() => options.canDecide === true),
    scopeOf: jest.fn(async () => ({ all: true, paths: [] })),
  };
  const service = new ProblemsService(prisma as never, access as never, {} as never, {} as never, {} as never);
  if (options.stubGet !== false) jest.spyOn(service, 'get').mockResolvedValue({ id: 'p1' } as never);
  return { service, prisma, access, events, handoffUpdates, tx, current };
}

/**
 * W7.28 / BA-problems-10: the group is not an ordinary field. A handover is a
 * command with its own authority and, when needed, its own acceptance.
 */
describe('ProblemsService handoff guards', () => {
  it('refuses to change the group through a plain update', async () => {
    const { service, prisma } = setup();
    await expect(service.update(viewer, 'p1', { version: 4, groupId: 'g2' } as never)).rejects.toMatchObject({
      code: problemErrorCodes.handoffRequired,
      detail: 'groupId',
    });
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
  });

  it('allows a unit move inside the group tree but not out of it', async () => {
    const inside = setup({ unitPath: '/root/ou1/child' });
    await inside.service.update(viewer, 'p1', { version: 4, organizationalUnitId: 'ou-child' } as never);
    expect(inside.prisma.problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationalUnitId: 'ou-child' }) }),
    );

    const outside = setup({ unitPath: '/root/ou2' });
    await expect(outside.service.update(viewer, 'p1', { version: 4, organizationalUnitId: 'ou2' } as never)).rejects.toMatchObject({
      code: problemErrorCodes.handoffRequired,
      detail: 'organizationalUnitId',
    });
    expect(outside.prisma.problem.updateMany).not.toHaveBeenCalled();
  });

  it('cancels a waiting transfer when the problem reaches a final status', async () => {
    const { service, events, handoffUpdates } = setup({ current: { status: 'RESOLVED' }, canDecide: true, cancelCount: 1 });
    await service.changeStatus(viewer, 'p1', { version: 4, status: 'CLOSED' } as never);

    expect(handoffUpdates).toEqual([expect.objectContaining({ status: 'CANCELLED', decisionReason: 'problem_final_status' })]);
    expect(events.map((event) => event.action)).toEqual(['status', 'handoff_cancelled']);
  });

  it('leaves a transfer alone while the problem stays open', async () => {
    const { service, handoffUpdates } = setup({ current: { status: 'NEW' }, canDecide: true, cancelCount: 1 });
    await service.changeStatus(viewer, 'p1', { version: 4, status: 'INVESTIGATING' } as never);
    expect(handoffUpdates).toEqual([]);
  });
});

describe('ProblemsService detail handoff', () => {
  it('exposes the waiting transfer to the side that may decide it', async () => {
    const { service } = setup({ current: { handoffs: [pendingHandoff] }, canDecide: true, stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as {
      handoff: { id: string; toGroup: { id: string } } | null;
      permissions: { canHandoff: boolean; canDecideHandoff: boolean; canCancelHandoff: boolean };
    };
    expect(detail.handoff).toMatchObject({ id: 'h1', toGroup: { id: 'g2' } });
    expect(detail.permissions).toMatchObject({ canHandoff: true, canDecideHandoff: true, canCancelHandoff: true });
  });

  it('hides the decision and the cancel action from a bystander', async () => {
    const { service } = setup({ current: { handoffs: [{ ...pendingHandoff, requestedByUserId: 'u9' }] }, canDecide: false, stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as {
      permissions: { canHandoff: boolean; canDecideHandoff: boolean; canCancelHandoff: boolean };
    };
    expect(detail.permissions.canDecideHandoff).toBe(false);
    expect(detail.permissions.canCancelHandoff).toBe(false);
  });

  it('lets the requester cancel the request they opened', async () => {
    const { service } = setup({ current: { handoffs: [pendingHandoff] }, canDecide: false, stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as { permissions: { canCancelHandoff: boolean } };
    expect(detail.permissions.canCancelHandoff).toBe(true);
  });

  it('offers no handoff on a final problem', async () => {
    const { service } = setup({ current: { status: 'CLOSED', handoffs: [] }, canDecide: true, stubGet: false });
    const detail = (await service.get(viewer, 'p1')) as unknown as { handoff: unknown; permissions: { canHandoff: boolean } };
    expect(detail.handoff).toBeNull();
    expect(detail.permissions.canHandoff).toBe(false);
  });
});

it('keeps the handoff error codes apart from validation errors', () => {
  expect(new ProblemError(problemErrorCodes.handoffRequired).code).toBe('PROBLEM_HANDOFF_REQUIRED');
  expect(new ProblemError(problemErrorCodes.handoffPending).code).toBe('PROBLEM_HANDOFF_PENDING');
});
