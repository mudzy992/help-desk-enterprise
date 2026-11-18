import { ProblemTicketsService } from './problem-tickets.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { problemVisibilityWhere } from './problem-visibility';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { publishPersistedTicketMessages } from '../tickets/publish-persisted-ticket-messages';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/ticket-realtime.hub', () => ({ TicketRealtimeHub: class TicketRealtimeHub {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));
jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn() }));
jest.mock('../tickets/publish-persisted-ticket-messages', () => ({ publishPersistedTicketMessages: jest.fn() }));
jest.mock('../tickets/insert-system-ticket-event', () => ({
  insertSystemTicketEvent: jest.fn(async (_client: unknown, input: { action: string; detail: string }) => ({ body: `${input.action}:${input.detail}` })),
}));

const loadTicket = loadAccessibleTicket as jest.MockedFunction<typeof loadAccessibleTicket>;

type Ticket = { id: string; ticketNumber: string; status: string; mergedIntoTicketId: string | null; visibility: 'staff' | 'public' };

function setup(options: { problemStatus?: string; tickets: Ticket[]; links?: Record<string, string> }) {
  const links = new Map(Object.entries(options.links ?? {}));
  const events: unknown[] = [];
  const prisma: Record<string, unknown> = {
    problem: {
      findFirst: jest.fn(async () => ({ id: 'p1', sequence: 12, title: 'Printer queue', status: options.problemStatus ?? 'INVESTIGATING' })),
    },
    problemTicket: {
      findUnique: jest.fn(async ({ where }: { where: { ticketId: string } }) =>
        links.has(where.ticketId) ? { problemId: links.get(where.ticketId) } : null,
      ),
      create: jest.fn(async ({ data }: { data: { problemId: string; ticketId: string } }) => {
        links.set(data.ticketId, data.problemId);
      }),
      deleteMany: jest.fn(async ({ where }: { where: { problemId: string; ticketId: string } }) => {
        if (links.get(where.ticketId) !== where.problemId) return { count: 0 };
        links.delete(where.ticketId);
        return { count: 1 };
      }),
    },
    problemEvent: { create: jest.fn(async (args: unknown) => events.push(args)) },
    ticket: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => options.tickets.find((item) => item.id === where.id) ?? null) },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(prisma)),
  };
  loadTicket.mockImplementation(async (_prisma, _loader, ticketId) => {
    const ticket = options.tickets.find((candidate) => candidate.id === ticketId);
    if (ticket === undefined) throw new Error('TICKET_NOT_FOUND');
    return { ticket: ticket as never, access: { visibility: ticket.visibility } };
  });
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-' })),
  };
  const service = new ProblemTicketsService(
    prisma as never,
    access as never,
    {} as never,
    { bind: jest.fn(async (context: unknown) => context) } as never,
    {} as never,
  );
  return { service, links, events, prisma, access };
}

const viewer = { userId: 'u1' } as never;
const ticket = (id: string, extra: Partial<Ticket> = {}): Ticket => ({
  id,
  ticketNumber: `T-${id}`,
  status: 'IN_PROGRESS',
  mergedIntoTicketId: null,
  visibility: 'staff',
  ...extra,
});

describe('ProblemTicketsService.link', () => {
  it('links accessible tickets and reports skipped ones with a reason', async () => {
    const { service, links, events } = setup({
      tickets: [ticket('a'), ticket('b', { mergedIntoTicketId: 'a' }), ticket('c'), ticket('d', { visibility: 'public' }), ticket('e')],
      links: { c: 'other', e: 'p1' },
    });
    const result = await service.link('p1', ['a', 'b', 'c', 'd', 'e', 'missing', 'a'], viewer);
    expect(result.linked).toEqual([{ ticketId: 'a', ticketNumber: 'T-a' }]);
    expect(result.skipped.map((item) => [item.ticketId, item.reason])).toEqual([
      ['b', 'merged'],
      ['c', 'other_problem'],
      ['d', 'not_found'],
      ['e', 'already_linked'],
      ['missing', 'not_found'],
    ]);
    expect(links.get('a')).toBe('p1');
    expect(events).toHaveLength(1);
  });

  it('reports a single failed ticket as an error (ticket panel)', async () => {
    const { service } = setup({ tickets: [ticket('a')], links: { a: 'other' } });
    await expect(service.link('p1', ['a'], viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.ticketInOtherProblem, 'other_problem'));
  });

  it('keeps a single failure as a result when creating from the ticket list', async () => {
    const { service } = setup({ tickets: [ticket('a')], links: { a: 'other' } });
    const result = await service.link('p1', ['a'], viewer, { singleAsError: false });
    expect(result.skipped).toHaveLength(1);
  });

  it('accepts links on a resolved problem as a recurrence (P5)', async () => {
    const { service } = setup({ problemStatus: 'RESOLVED', tickets: [ticket('a')] });
    const result = await service.link('p1', ['a'], viewer);
    expect(result.linked).toHaveLength(1);
  });

  it('refuses links on a final problem', async () => {
    const { service } = setup({ problemStatus: 'CLOSED', tickets: [ticket('a')] });
    await expect(service.link('p1', ['a'], viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.problemNotOpen));
  });

  it('skips archived tickets as read-only', async () => {
    const { service } = setup({ tickets: [ticket('a', { status: 'ARCHIVED' }), ticket('b')] });
    const result = await service.link('p1', ['a', 'b'], viewer);
    expect(result.skipped).toEqual([{ ticketId: 'a', ticketNumber: 'T-a', reason: 'read_only' }]);
  });
});

describe('ProblemTicketsService.linkInTransaction (W7.26)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links inside the caller transaction, locks the tickets and leaves publishing to the caller', async () => {
    const { service, links, events, prisma } = setup({
      tickets: [ticket('a'), ticket('b', { mergedIntoTicketId: 'a' }), ticket('c')],
      links: { c: 'other' },
    });
    const outcome = await service.linkInTransaction(prisma as never, { id: 'p1', status: 'NEW' }, ['c', 'a', 'b', 'a'], viewer);
    expect(outcome.result.linked).toEqual([{ ticketId: 'a', ticketNumber: 'T-a' }]);
    expect(outcome.result.skipped.map((item) => [item.ticketId, item.reason])).toEqual([
      ['c', 'other_problem'],
      ['b', 'merged'],
    ]);
    expect(outcome.notices).toHaveLength(1);
    expect(links.get('a')).toBe('p1');
    expect(events).toHaveLength(1);
    // The batch runs in the caller's transaction: no nested one, and no realtime
    // event before the caller commits.
    expect(prisma.$transaction as jest.Mock).not.toHaveBeenCalled();
    expect(publishPersistedTicketMessages).not.toHaveBeenCalled();
    const lock = (prisma.$queryRaw as jest.Mock).mock.calls[0];
    expect(lock[0].join(' ')).toContain('FOR UPDATE');
    expect(lock[1]).toEqual(['a', 'b', 'c']);
  });

  it('publishes the pending notices only when the caller asks', async () => {
    const { service, prisma } = setup({ tickets: [ticket('a')] });
    const outcome = await service.linkInTransaction(prisma as never, { id: 'p1', status: 'NEW' }, ['a'], viewer);
    service.publish(outcome.notices);
    expect(publishPersistedTicketMessages).toHaveBeenCalledTimes(1);
  });

  it('does not open a lock or a link for an empty batch', async () => {
    const { service, prisma } = setup({ tickets: [] });
    const outcome = await service.linkInTransaction(prisma as never, { id: 'p1', status: 'NEW' }, ['  ', ''], viewer);
    expect(outcome).toEqual({ result: { linked: [], skipped: [] }, notices: [] });
    expect(prisma.$queryRaw as jest.Mock).not.toHaveBeenCalled();
  });

  it('refuses a batch on a final problem', async () => {
    const { service, prisma } = setup({ tickets: [ticket('a')] });
    await expect(service.linkInTransaction(prisma as never, { id: 'p1', status: 'CLOSED' }, ['a'], viewer)).rejects.toEqual(
      new ProblemError(problemErrorCodes.problemNotOpen),
    );
  });
});

describe('ProblemTicketsService.unlink', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['public', 'missing'] as const)('refuses %s target without deleting or recording events', async (visibility) => {
    const { service, links, events } = setup({
      tickets: visibility === 'missing' ? [] : [ticket('a', { visibility })],
      links: { a: 'p1' },
    });
    await expect(service.unlink('p1', 'a', viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.ticketNotFound));
    expect(links.get('a')).toBe('p1');
    expect(events).toHaveLength(0);
  });

  it('does not unlink when the ticket policy rejects the write', async () => {
    const { service, links, events } = setup({ tickets: [ticket('a')], links: { a: 'p1' } });
    loadTicket.mockRejectedValueOnce(new Error('FORBIDDEN'));
    await expect(service.unlink('p1', 'a', viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.ticketNotFound));
    expect(links.get('a')).toBe('p1');
    expect(events).toHaveLength(0);
  });

  it('rechecks the problem status after acquiring the lock', async () => {
    const { service, links, events, prisma } = setup({ tickets: [ticket('a')], links: { a: 'p1' } });
    const findProblem = (prisma.problem as { findFirst: jest.Mock }).findFirst;
    findProblem.mockResolvedValueOnce({ id: 'p1', sequence: 12, title: 'Problem', status: 'INVESTIGATING' });
    findProblem.mockResolvedValueOnce({ id: 'p1', sequence: 12, title: 'Problem', status: 'CLOSED' });
    await expect(service.unlink('p1', 'a', viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.problemNotOpen));
    expect(loadTicket).not.toHaveBeenCalled();
    expect(links.get('a')).toBe('p1');
    expect(events).toHaveLength(0);
  });

  it('does not remove a link belonging to another problem', async () => {
    const { service, links, events } = setup({ tickets: [ticket('a')], links: { a: 'other' } });
    await expect(service.unlink('p1', 'a', viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.ticketNotLinked));
    expect(links.get('a')).toBe('other');
    expect(events).toHaveLength(0);
  });

  it('checks writable staff access within the transaction before unlinking', async () => {
    const { service, links, events, prisma } = setup({ tickets: [ticket('a')], links: { a: 'p1' } });
    await service.unlink('p1', 'a', viewer);
    expect(loadTicket).toHaveBeenCalledWith(prisma, expect.anything(), 'a', expect.anything(), { writable: true });
    expect((prisma.$queryRaw as jest.Mock)).toHaveBeenCalledTimes(2);
    expect(loadTicket.mock.invocationCallOrder[0]).toBeLessThan((prisma.problemTicket as { deleteMany: jest.Mock }).deleteMany.mock.invocationCallOrder[0]);
    expect(links.has('a')).toBe(false);
    expect(events).toHaveLength(1);
  });
});

describe('ProblemTicketsService.listForProblem', () => {
  it('applies the canonical ticket predicate in the database before limiting and counting', async () => {
    const { service, prisma } = setup({ tickets: [] });
    const visible = { id: { in: ['visible'] } };
    (problemTicketVisibility as jest.Mock).mockResolvedValue(visible);
    const date = new Date('2026-01-01T00:00:00Z');
    const findMany = jest.fn(async () => [{ linkedAt: date, ticket: {
      id: 'visible', ticketNumber: 'T-1', title: 'Visible', status: 'IN_PROGRESS', priority: 'LOW',
      isConfidential: false, createdAt: date, requester: null, originUnit: null, assignedUser: null,
    } }]);
    Object.assign(prisma.problemTicket as object, {
      findMany,
      // BA-problems-17: total and open are counted, not read off the window.
      count: jest.fn(async () => 1),
    });
    const result = await service.listForProblem('p1', viewer);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { problemId: 'p1', ticket: { is: visible } }, take: 501 }));
    expect(result).toMatchObject({ total: 1, open: 1, hasMore: false, items: [{ id: 'visible' }] });
  });

  // BA-problems-17: the window is 500 links, but `total` and `open` are counted.
  it('reports the real total and hasMore beyond the ticket window', async () => {
    const { service, prisma } = setup({ tickets: [] });
    const visible = { id: { in: ['visible'] } };
    (problemTicketVisibility as jest.Mock).mockResolvedValue(visible);
    const date = new Date('2026-01-01T00:00:00Z');
    const findMany = jest.fn(async () => Array.from({ length: 501 }, (_, i) => ({
      linkedAt: date,
      ticket: {
        id: `t${i}`, ticketNumber: `T-${i}`, title: 'T', status: 'NEW', priority: 'LOW',
        isConfidential: false, createdAt: date, requester: null, originUnit: { id: 'ou1', name: 'Unit' }, assignedUser: null,
      },
    })));
    const count = jest.fn(async () => 620);
    Object.assign(prisma.problemTicket as object, { findMany, count });
    const result = await service.listForProblem('p1', viewer);
    expect(result.items).toHaveLength(500);
    expect(result.total).toBe(620);
    expect(result.open).toBe(620);
    expect(result.hasMore).toBe(true);
  });

  it('fails closed if visibility cannot be established', async () => {
    const { service, prisma } = setup({ tickets: [] });
    const findMany = jest.fn();
    Object.assign(prisma.problemTicket as object, { findMany });
    (problemTicketVisibility as jest.Mock).mockRejectedValue(new Error('unavailable'));
    await expect(service.listForProblem('p1', viewer)).rejects.toThrow('unavailable');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('ProblemTicketsService.panel', () => {
  it('keeps the minimal ticket panel but does not offer full access or unlink outside the problem scope', async () => {
    const { service, prisma, access } = setup({ tickets: [ticket('a')] });
    Object.assign(access, {
      isEnabled: jest.fn(async () => true),
      hasPermission: jest.fn(() => true),
      scopeOf: jest.fn(async () => ({ all: false, paths: ['/other'] })),
    });
    Object.assign(prisma.problem as object, { count: jest.fn(async () => 0) });
    (prisma.problemTicket as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      problem: { id: 'p1', sequence: 12, title: 'Problem', status: 'NEW', priority: 'LOW', workaround: 'workaround', workaroundAt: null },
    });
    const result = await service.panel('a', viewer);
    expect(result).toMatchObject({ visible: true, canUnlink: false, problem: { title: 'Problem', workaround: 'workaround', canOpen: false } });
  });
});

describe('problemVisibilityWhere', () => {
  it('is unrestricted for an unscoped viewer', () => {
    expect(problemVisibilityWhere({ all: true, paths: [] } as never, 'u1')).toBeNull();
  });

  it('does not grant full problem visibility through linked tickets or reporter identity', () => {
    const where = problemVisibilityWhere({ all: false, paths: ['/root/it'] } as never, 'u1');
    expect(JSON.stringify(where)).not.toContain('assignedUserId');
    expect(JSON.stringify(where)).not.toContain('createdByUserId');
    expect(JSON.stringify(where)).toContain('/root/it/');
  });

  it('denies empty scopes without embedding a PostgreSQL-invalid null character', () => {
    const where = problemVisibilityWhere({ all: false, paths: [] }, 'u1');
    expect(where).toEqual({ id: { in: [] } });
  });
});
