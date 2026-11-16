import { ProblemsService } from './problems.service';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { problemAssetAccess } from './problem-asset-access';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/priority/ticket-priority-matrix-configuration.loader', () => ({ TicketPriorityMatrixConfigurationLoader: class TicketPriorityMatrixConfigurationLoader {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn() }));
jest.mock('./problem-asset-access', () => ({
  ...jest.requireActual('./problem-asset-access'),
  problemAssetAccess: jest.fn(),
}));

const viewer = { userId: 'u1' } as never;
const when = new Date('2026-01-01T00:00:00Z');
const event = (id: string, action: string, detail: unknown = null) => ({ id, action, detail, actorUserId: null, createdAt: when });
function setup(batches: unknown[][]) {
  const findMany = jest.fn().mockImplementation(async () => batches.shift() ?? []);
  const tickets = jest.fn(async () => [{ id: 'visible' }]);
  const assets = jest.fn(async () => [{ id: 'visible-asset' }]);
  const prisma = {
    problem: { findFirst: jest.fn(async () => ({ id: 'p1' })) },
    problemEvent: { findMany },
    ticket: { findMany: tickets },
    asset: { findMany: assets },
    user: { findMany: jest.fn(async () => []) },
  };
  const access = { require: jest.fn(async () => ({ all: true, paths: [] })) };
  return { service: new ProblemsService(prisma as never, access as never, {} as never, {} as never), findMany, tickets, assets };
}

describe('problem event ticket visibility', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (problemTicketVisibility as jest.Mock).mockResolvedValue({ id: { in: ['visible'] } });
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: null });
  });
  it('omits inaccessible, malformed, aggregate and unknown events, but keeps visible ticket and problem events', async () => {
    const { service, tickets } = setup([[event('1', 'ticket_linked', { ticketId: 'hidden', ticketNumber: 'SECRET' }),
      event('2', 'ticket_unlinked', { ticketId: 'visible', ticketNumber: 'T-1' }), event('3', 'ticket_linked', {}),
      event('4', 'tickets_resolved', { resolved: 5 }), event('5', 'created'), event('6', 'unknown', { ticketId: 'hidden' })]]);
    const result = await service.events(viewer, 'p1');
    expect(result.items.map((item) => item.id)).toEqual(['2', '5']);
    expect(tickets).toHaveBeenCalledWith({ where: { AND: [{ id: { in: ['visible'] } }, { id: { in: ['hidden', 'visible'] } }] }, select: { id: true } });
  });
  it('continues past a full page of inaccessible events before applying the cap', async () => {
    const hidden = Array.from({ length: 200 }, (_, i) => event(`h${i}`, 'ticket_linked', { ticketId: 'hidden' }));
    const { service, findMany } = setup([hidden, [event('visible-event', 'created')]]);
    const result = await service.events(viewer, 'p1');
    expect(result.items.map((item) => item.id)).toEqual(['visible-event']);
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'h199' }, skip: 1, take: 200 });
  });
  it('fails closed when ticket visibility is unavailable', async () => {
    const { service, findMany } = setup([]);
    (problemTicketVisibility as jest.Mock).mockRejectedValue(new Error('unavailable'));
    await expect(service.events(viewer, 'p1')).rejects.toThrow('unavailable');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('hides asset history for CMDB items outside the viewer scope', async () => {
    const scope = { organizationalUnit: { OR: [{ ouPath: '/inside' }, { ouPath: { startsWith: '/inside/' } }] } };
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: true, where: scope });
    const { service, assets } = setup([[
      event('1', 'asset_linked', { assetId: 'foreign-asset', assetTag: 'SECRET-PC', name: 'Secret' }),
      event('2', 'asset_unlinked', { assetId: 'visible-asset', assetTag: 'PC-1', name: 'Laptop' }),
      event('3', 'asset_linked', { assetTag: 'NO-ID' }),
      event('4', 'created'),
    ]]);
    const result = await service.events(viewer, 'p1');
    expect(result.items.map((item) => item.id)).toEqual(['2', '4']);
    expect(assets).toHaveBeenCalledWith({ where: { AND: [scope, { id: { in: ['foreign-asset', 'visible-asset'] } }] }, select: { id: true } });
  });

  it('drops every asset event and skips the CMDB query without asset.read', async () => {
    (problemAssetAccess as jest.Mock).mockResolvedValue({ allowed: false, where: null });
    const { service, assets } = setup([[event('1', 'asset_linked', { assetId: 'a1' }), event('2', 'created')]]);
    const result = await service.events(viewer, 'p1');
    expect(result.items.map((item) => item.id)).toEqual(['2']);
    expect(assets).not.toHaveBeenCalled();
  });
});
