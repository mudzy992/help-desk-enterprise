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
const date = new Date('2026-01-01T00:00:00Z');
function setup() {
  const row = { id: 'p1', sequence: 1, title: 'Problem', status: 'NEW', priority: 'LOW', rootCauseCategory: null,
    owner: null, group: null, organizationalUnit: { ouPath: '/unit' }, service: null, targetAt: null,
    createdAt: date, updatedAt: date, ownerUserId: null, groupId: null };
  const groupBy = jest.fn().mockResolvedValueOnce([{ problemId: 'p1', _count: { _all: 2 } }])
    .mockResolvedValueOnce([{ problemId: 'p1', _count: { _all: 1 } }]);
  const prisma = { problem: { findMany: jest.fn(async (_args: unknown) => [row]), count: jest.fn(async () => 1), findFirst: jest.fn(async () => row) }, problemTicket: { groupBy } };
  const access = { require: jest.fn(async () => ({ all: true, paths: [] })), configuration: jest.fn(async () => ({ numberPrefix: 'P-' })), hasPermission: jest.fn(() => false) };
  const service = new ProblemsService(prisma as never, access as never, {} as never, {} as never);
  return { service, prisma, groupBy };
}

describe('visible problem ticket counts', () => {
  beforeEach(() => { jest.resetAllMocks(); (problemTicketVisibility as jest.Mock).mockResolvedValue({ id: { in: ['visible'] } }); });
  it('applies visibility to both total and open aggregation and does not select unrestricted counts', async () => {
    const { service, prisma, groupBy } = setup();
    const result = await service.list(viewer, {});
    expect(result.items[0]).toMatchObject({ ticketCount: 2, openTicketCount: 1 });
    expect(prisma.problem.findMany.mock.calls[0][0]).not.toHaveProperty('select._count');
    expect(groupBy.mock.calls[0][0].where).toEqual({ problemId: { in: ['p1'] }, ticket: { is: { id: { in: ['visible'] } } } });
    expect(groupBy.mock.calls[1][0].where.AND[0]).toEqual(groupBy.mock.calls[0][0].where);
  });
  it('uses scoped counts for the detail response', async () => {
    const { service, groupBy } = setup();
    expect(await service.get(viewer, 'p1')).toMatchObject({ ticketCount: 2 });
    expect(groupBy.mock.calls[0][0].where.ticket).toEqual({ is: { id: { in: ['visible'] } } });
  });
  it('fails closed if ticket visibility cannot be loaded', async () => {
    const { service, groupBy } = setup();
    (problemTicketVisibility as jest.Mock).mockRejectedValue(new Error('unavailable'));
    await expect(service.list(viewer, {})).rejects.toThrow('unavailable');
    expect(groupBy).not.toHaveBeenCalled();
  });
});
