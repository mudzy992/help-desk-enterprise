import { loadProblemReportData } from './load-problem-report-data';

const window = { from: new Date('2026-01-01'), to: new Date('2026-02-01') };
const visibility = { problem: { id: { in: ['p1'] } }, ticket: { id: { in: ['visible'] } } };

describe('problem report visibility', () => {
  it('filters tickets before every top aggregation, including total and open counts', async () => {
    const groupBy = jest.fn().mockResolvedValueOnce([{ problemId: 'p1', _count: { _all: 1 } }]).mockResolvedValueOnce([{ problemId: 'p1', _count: { _all: 1 } }]);
    const findMany = jest.fn(async (_args: { select: { _count: { select: { tickets: { where: { ticket: unknown } } } } } }) => [{ id: 'p1', sequence: 1, title: 'P', status: 'NEW', priority: 'LOW', rootCauseCategory: null, service: null, group: null, _count: { tickets: 1 } }]);
    const prisma = { problemTicket: { groupBy }, problem: { findMany }, appSetting: { findUnique: async () => ({ value: 'P-' }) } };
    const result = await loadProblemReportData(prisma as never, { unitIds: ['u1'], part: 'top', window, now: window.to, visibility });
    expect(result.top[0]).toMatchObject({ ticketsInPeriod: 1, ticketsTotal: 1, openTickets: 1 });
    expect(groupBy.mock.calls[0][0].where.ticket).toEqual({ is: visibility.ticket });
    expect(findMany.mock.calls[0][0].select._count.select.tickets.where.ticket).toEqual({ is: visibility.ticket });
    expect(groupBy.mock.calls[1][0].where.ticket.is.AND[0]).toEqual(visibility.ticket);
  });

  it('omits recurrence events for hidden and deleted tickets before aggregation', async () => {
    const events = ['visible', 'hidden', null].map((id) => ({ createdAt: window.from, detail: id === null ? {} : { ticketId: id }, problem: { sequence: 1, title: 'P', status: 'RESOLVED', resolvedAt: window.from } }));
    const prisma = { problemEvent: { findMany: jest.fn(async () => events) }, ticket: { findMany: jest.fn(async () => [{ id: 'visible' }]) }, appSetting: { findUnique: async () => ({ value: 'P-' }) } };
    const result = await loadProblemReportData(prisma as never, { unitIds: ['u1'], part: 'recurrence', window, now: window.to, visibility });
    expect(result.recurrence).toHaveLength(1);
    expect(prisma.ticket.findMany).toHaveBeenCalledWith({ where: { AND: [visibility.ticket, { id: { in: ['visible', 'hidden'] } }] }, select: { id: true } });
    expect(prisma.problemEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ problem: { AND: [{ organizationalUnitId: { in: ['u1'] } }, visibility.problem] } }) }));
  });
});
