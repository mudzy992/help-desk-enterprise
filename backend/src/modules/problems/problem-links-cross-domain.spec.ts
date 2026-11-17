import { ProblemLinksService } from './problem-links.service';
import { problemErrorCodes } from './problems.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => null) }));
jest.mock('./problem-asset-access', () => ({
  ...jest.requireActual('./problem-asset-access'),
  problemAssetAccess: jest.fn(async () => ({ allowed: true, where: null })),
}));

const viewer = { userId: 'u1', isSuperAdmin: false, grants: [], homeOrganizationalUnitId: null } as never;

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    subjectId: 'u1',
    isLocalOnly: true,
    isSuperAdmin: false,
    assignments: [
      {
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: ['problem.read', 'problem.manage', 'status.incidents.read'],
        organizationalUnitId: null,
        organizationalUnitPath: null,
        serviceId: 'svc-a',
      },
    ],
    ...overrides,
  };
}

function setup(options: {
  authorization?: AuthorizationContext | null;
  service?: { id: string; name: string } | null;
  incident?: { id: string; title: string } | null;
  linkError?: unknown;
} = {}) {
  const problem = { id: 'p1', status: 'INVESTIGATING', groupId: 'g1', serviceId: 's-main' };
  const txEvents: Record<string, unknown>[] = [];
  const transaction = {
    problemService: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
    problemIncident: { create: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
    problemAsset: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        txEvents.push(data);
      }),
    },
  };
  const prisma = {
    ...transaction,
    problem: { findFirst: jest.fn(async () => problem), findMany: jest.fn(async () => []) },
    problemService: { ...transaction.problemService, findMany: jest.fn(async () => []) },
    problemAsset: { ...transaction.problemAsset, findMany: jest.fn(async () => []) },
    problemIncident: { ...transaction.problemIncident, findMany: jest.fn(async () => []) },
    ticketAsset: { groupBy: jest.fn(async () => []) },
    asset: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => ({ assetTag: 'PC-0042', name: 'Laptop' })), count: jest.fn(async () => 1) },
    service: { findFirst: jest.fn(async () => options.service === undefined ? { id: 's2', name: 'Mail' } : options.service) },
    serviceIncident: {
      findFirst: jest.fn(async () => options.incident === undefined ? { id: 'i1', title: 'VPN prekid' } : options.incident),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 1),
    },
    problemEvent: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
      if (options.linkError !== undefined) throw options.linkError;
      return callback(transaction);
    }),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    cmdbEnabled: jest.fn(async () => true),
    statusPageEnabled: jest.fn(async () => true),
    hasGroupAuthority: jest.fn(async () => true),
    requireGroupAuthority: jest.fn(async () => undefined),
    capabilities: jest.fn(async () => ({ enabled: true, canRead: true, configuration: { numberPrefix: 'P-' } })),
  };
  const loader = { loadBySubjectId: jest.fn(async () => options.authorization ?? context()) };
  const service = new ProblemLinksService(prisma as never, access as never, loader as never, {} as never);
  return { service, prisma, loader, transaction, txEvents };
}

/**
 * W7.29 / BA-problems-11: a problem only carries a service/incident reference
 * that its own domain would also show the caller, and every link write keeps
 * its history line in the same transaction.
 */
describe('ProblemLinksService cross-domain policy', () => {
  it('filters the linked services by the catalog policy of the caller', async () => {
    const { service, prisma } = setup();
    await service.get('p1', viewer);
    expect(prisma.problemService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { problemId: 'p1', service: { is: { lifecycle: { in: ['ACTIVE', 'DEPRECATED'] } } } },
      }),
    );
  });

  it('filters the linked incidents by the status-page visibility of the caller', async () => {
    const { service, prisma } = setup();
    await service.get('p1', viewer);
    const where = (prisma.problemIncident.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({
      AND: [
        { problemId: 'p1' },
        {
          OR: [
            { visibility: 'ALL_USERS' },
            { visibility: 'STAFF_ONLY', services: { some: {}, every: { service: { OR: [{ id: { in: ['svc-a'] } }] } } } },
          ],
        },
      ],
    });
  });

  it('shows a service-scoped admin the drafts of its own service only', async () => {
    const scoped = setup({
      authorization: context({
        assignments: [
          {
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: ['problem.read', 'problem.manage'],
            organizationalUnitId: null,
            organizationalUnitPath: null,
            serviceId: 'svc-a',
          },
        ],
      }),
    });
    await scoped.service.get('p1', viewer);
    expect(scoped.prisma.problemService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          problemId: 'p1',
          service: {
            is: {
              AND: [
                {
                  OR: [
                    { lifecycle: { in: ['ACTIVE'] } },
                    { lifecycle: { in: ['DRAFT', 'DEPRECATED'] }, id: { in: ['svc-a'] } },
                  ],
                },
              ],
            },
          },
        },
      }),
    );
  });

  it('refuses a service the catalog hides, without saying whether it exists', async () => {
    const { service, prisma } = setup({ service: null });
    await expect(service.linkService('p1', viewer, 'svc-draft')).rejects.toMatchObject({ code: problemErrorCodes.serviceNotFound });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: [{ id: 'svc-draft' }, expect.anything()] }) }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes the extra service and its history line in one transaction', async () => {
    const { service, prisma, transaction, txEvents } = setup();
    expect(await service.linkService('p1', viewer, 's2')).toEqual({ linked: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.problemService.create).toHaveBeenCalledWith({ data: { problemId: 'p1', serviceId: 's2' } });
    expect(txEvents).toEqual([expect.objectContaining({ action: 'service_linked' })]);
    // The history line is written by the same transaction, never afterwards.
    expect(prisma.problemEvent.create).not.toHaveBeenCalled();
  });

  it('treats a parallel link as already linked and writes no second history line', async () => {
    const { service, txEvents } = setup({ linkError: Object.assign(new Error('unique'), { code: 'P2002' }) });
    expect(await service.linkService('p1', viewer, 's2')).toEqual({ linked: 0 });
    expect(txEvents).toEqual([]);
  });

  it('unlinks a service and records the history in the same transaction', async () => {
    const { service, prisma, transaction, txEvents } = setup();
    await service.unlinkService('p1', viewer, 's2');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.problemService.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1', serviceId: 's2' } });
    expect(txEvents).toEqual([expect.objectContaining({ action: 'service_unlinked', detail: expect.objectContaining({ name: 'Mail' }) })]);
  });

  it('refuses a hidden service on unlink instead of revealing its name', async () => {
    const { service, prisma } = setup({ service: null });
    await expect(service.unlinkService('p1', viewer, 's2')).rejects.toMatchObject({ code: problemErrorCodes.serviceNotFound });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps STAFF_ONLY incidents of other services out of the picker', async () => {
    const scoped = setup({
      authorization: context({
        assignments: [
          {
            roleKey: authorizationRoleKeys.agent,
            permissionKeys: ['problem.read', 'problem.manage'],
            organizationalUnitId: null,
            organizationalUnitPath: null,
            serviceId: 'svc-a',
          },
        ],
      }),
    });
    await scoped.service.searchIncidents('p1', viewer, 'VPN');
    expect(scoped.prisma.serviceIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([expect.anything()]) }) }),
    );

    const requester = setup({ authorization: context({ assignments: [] }) });
    await requester.service.searchIncidents('p1', viewer, 'VPN');
    expect(requester.prisma.serviceIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [expect.anything(), { visibility: 'ALL_USERS' }] } }),
    );
  });

  it('refuses an incident the status page does not show to the caller', async () => {
    const { service, prisma } = setup({ incident: null });
    await expect(service.linkIncident('p1', viewer, 'i-staff')).rejects.toMatchObject({ code: problemErrorCodes.incidentNotFound });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes the incident link and its history line in one transaction', async () => {
    const { service, transaction, txEvents, prisma } = setup();
    expect(await service.linkIncident('p1', viewer, 'i1')).toEqual({ linked: 1 });
    expect(transaction.problemIncident.create).toHaveBeenCalledWith({ data: { problemId: 'p1', incidentId: 'i1' } });
    expect(txEvents).toEqual([expect.objectContaining({ action: 'incident_linked' })]);
    expect(prisma.problemEvent.create).not.toHaveBeenCalled();
  });

  it('unlinks an incident with its history line in the same transaction', async () => {
    const { service, transaction, txEvents } = setup();
    await service.unlinkIncident('p1', viewer, 'i1');
    expect(transaction.problemIncident.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1', incidentId: 'i1' } });
    expect(txEvents).toEqual([expect.objectContaining({ action: 'incident_unlinked' })]);
  });

  it('removes an asset with its history line in the same transaction', async () => {
    const { service, transaction, txEvents, prisma } = setup();
    await service.unlinkAsset('p1', viewer, 'a1');
    expect(transaction.problemAsset.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1', assetId: 'a1' } });
    expect(txEvents).toEqual([expect.objectContaining({ action: 'asset_unlinked' })]);
    expect(prisma.problemEvent.create).not.toHaveBeenCalled();
  });

  it('answers an invisible incident with no problems at all', async () => {
    const { service, prisma } = setup();
    prisma.serviceIncident.count.mockResolvedValueOnce(0);
    expect(await service.forIncident('i-staff', viewer)).toEqual({ items: [] });
    expect(prisma.problem.findMany).not.toHaveBeenCalled();
  });
});
