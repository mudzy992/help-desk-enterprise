import { ProblemTicketsService } from './problem-tickets.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { problemVisibilityWhere } from './problem-visibility';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';

jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
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
    },
    problemEvent: { create: jest.fn(async (args: unknown) => events.push(args)) },
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
  return { service, links, events };
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

  it('refuses links on a resolved or final problem', async () => {
    const { service } = setup({ problemStatus: 'RESOLVED', tickets: [ticket('a')] });
    await expect(service.link('p1', ['a'], viewer)).rejects.toEqual(new ProblemError(problemErrorCodes.problemNotOpen));
  });

  it('skips archived tickets as read-only', async () => {
    const { service } = setup({ tickets: [ticket('a', { status: 'ARCHIVED' }), ticket('b')] });
    const result = await service.link('p1', ['a', 'b'], viewer);
    expect(result.skipped).toEqual([{ ticketId: 'a', ticketNumber: 'T-a', reason: 'read_only' }]);
  });
});

describe('problemVisibilityWhere', () => {
  it('is unrestricted for an unscoped viewer', () => {
    expect(problemVisibilityWhere({ all: true, paths: [] } as never, 'u1')).toBeNull();
  });

  it('adds problems with a linked ticket the viewer works on', () => {
    const where = problemVisibilityWhere({ all: false, paths: ['/root/it'] } as never, 'u1');
    expect(JSON.stringify(where)).toContain('"assignedUserId":"u1"');
    expect(JSON.stringify(where)).toContain('/root/it/');
  });
});
