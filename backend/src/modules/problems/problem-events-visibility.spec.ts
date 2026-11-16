import { ProblemsService } from './problems.service';
import { problemTicketVisibility } from './problem-ticket-visibility';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/priority/ticket-priority-matrix-configuration.loader', () => ({ TicketPriorityMatrixConfigurationLoader: class TicketPriorityMatrixConfigurationLoader {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn() }));

const viewer = { userId: 'u1' } as never;
const when = new Date('2026-01-01T00:00:00Z');
const event = (id: string, action: string, detail: unknown = null) => ({ id, action, detail, actorUserId: null, createdAt: when });
function setup(batches: unknown[][]) {
  const findMany = jest.fn().mockImplementation(async () => batches.shift() ?? []);
  const tickets = jest.fn(async () => [{ id: 'visible' }]);
  const prisma = { problem: { findFirst: jest.fn(async () => ({ id: 'p1' })) }, problemEvent: { findMany }, ticket: { findMany: tickets }, user: { findMany: jest.fn(async () => []) } };
  const access = { require: jest.fn(async () => ({ all: true, paths: [] })) };
  return { service: new ProblemsService(prisma as never, access as never, {} as never, {} as never), findMany, tickets };
}

describe('problem event ticket visibility', () => {
  beforeEach(() => { jest.resetAllMocks(); (problemTicketVisibility as jest.Mock).mockResolvedValue({ id: { in: ['visible'] } }); });
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
});
