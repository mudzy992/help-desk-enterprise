import { ProblemsService } from './problems.service';
import { problemErrorCodes } from './problems.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';

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

const viewer = { userId: 'u1', isSuperAdmin: false, grants: [], homeOrganizationalUnitId: null } as never;
const date = new Date('2026-11-17T09:00:00Z');

function authorization(roleKey: string, serviceId: string | null = null): AuthorizationContext {
  return {
    subjectId: 'u1',
    isLocalOnly: true,
    isSuperAdmin: false,
    assignments: [
      {
        roleKey,
        permissionKeys: ['problem.read', 'problem.manage'],
        organizationalUnitId: null,
        organizationalUnitPath: null,
        serviceId,
      },
    ],
  };
}

function setup(options: { authorization?: AuthorizationContext | null; serviceVisible?: boolean } = {}) {
  const current = {
    id: 'p1',
    sequence: 7,
    title: 'Štampač',
    description: 'Opis',
    status: 'INVESTIGATING',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
    urgency: 'MEDIUM',
    ownerUserId: 'u-owner',
    groupId: 'g1',
    organizationalUnitId: 'ou1',
    organizationalUnit: { id: 'ou1', name: 'Jedinica A', ouPath: '/root/ou1' },
    serviceId: null as string | null,
    version: 4,
    createdAt: date,
    updatedAt: date,
    targetRemindersSent: [],
  };
  const delegates = {
    problem: {
      findFirst: jest.fn(async () => current),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    problemEvent: { create: jest.fn(async () => ({})) },
    problemTicket: { groupBy: jest.fn(async () => []) },
    service: {
      findMany: jest.fn(async () => [{ id: 'svc-a', name: 'Mail' }]),
      findFirst: jest.fn(async () => (options.serviceVisible === false ? null : { id: 'svc-draft' })),
    },
    group: {
      findUnique: jest.fn(async () => ({ isProblemGroup: true, organizationalUnit: { ouPath: '/root/ou1' } })),
      findMany: jest.fn(async () => [{ id: 'g1', name: 'Grupa A' }]),
    },
    organizationalUnit: {
      findUnique: jest.fn(async () => ({ ouPath: '/root/ou1/child' })),
      findMany: jest.fn(async () => [{ id: 'ou1', name: 'Jedinica A', ouPath: '/root/ou1' }]),
    },
  };
  const prisma = {
    ...delegates,
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => run(delegates)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', rootCauseCategories: ['SW'], requireWorkaroundForKnownError: false })),
    requireGroupAuthority: jest.fn(async () => undefined),
    requireUnitInScope: jest.fn(async () => ({ id: 'ou1', ouPath: '/root/ou1', name: 'Jedinica A' })),
    hasGroupAuthority: jest.fn(async () => true),
    hasPermission: jest.fn(() => true),
    scopeOf: jest.fn(async () => ({ all: true, paths: [] })),
    cmdbEnabled: jest.fn(async () => false),
    statusPageEnabled: jest.fn(async () => false),
    capabilities: jest.fn(async () => ({ enabled: true, canRead: true, configuration: { numberPrefix: 'P-' } })),
  };
  const loader = { loadBySubjectId: jest.fn(async () => options.authorization ?? authorization(authorizationRoleKeys.agent)) };
  const service = new ProblemsService(prisma as never, access as never, loader as never, {} as never, {} as never);
  jest.spyOn(service, 'get').mockResolvedValue({ id: 'p1' } as never);
  return { service, prisma, access, loader };
}

/**
 * W7.29 / BA-problems-11: the service field and the service picker follow the
 * catalog's read policy. `problem.manage` does not turn a draft into a readable
 * service, and a hidden service cannot be attached to a problem.
 */
describe('ProblemsService service visibility', () => {
  it('offers only the lifecycles the catalog shows this user', async () => {
    const { service, prisma } = setup();
    await service.options(viewer);
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } } }),
    );
  });

  it('offers drafts to a global admin only', async () => {
    const { service, prisma } = setup({ authorization: authorization(authorizationRoleKeys.admin) });
    await service.options(viewer);
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lifecycle: { in: ['DRAFT', 'ACTIVE', 'DEPRECATED'] } } }),
    );
  });

  it('refuses to attach a service the caller cannot read', async () => {
    const { service, prisma } = setup({ serviceVisible: false });
    await expect(service.update(viewer, 'p1', { version: 4, serviceId: 'svc-draft' } as never)).rejects.toMatchObject({
      code: problemErrorCodes.serviceNotFound,
    });
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
  });

  it('attaches a readable service and checks it inside the catalog filter', async () => {
    const { service, prisma } = setup();
    await service.update(viewer, 'p1', { version: 4, serviceId: 'svc-active' } as never);
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: 'svc-active' }, { lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } }] },
      }),
    );
    expect(prisma.problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ serviceId: 'svc-active' }) }),
    );
  });
});
