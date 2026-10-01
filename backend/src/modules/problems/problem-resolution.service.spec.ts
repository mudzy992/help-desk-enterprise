import { ConflictException } from '@nestjs/common';
import { buildKnownErrorArticle } from './problem-article';
import { ProblemResolutionService, ticketFailureCode } from './problem-resolution.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { createKnowledgeArticle } from '../knowledge-base/create-knowledge-article';

jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('../knowledge-base/create-knowledge-article', () => ({ createKnowledgeArticle: jest.fn() }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

const loadTicket = loadAccessibleTicket as jest.MockedFunction<typeof loadAccessibleTicket>;
const createArticle = createKnowledgeArticle as jest.MockedFunction<typeof createKnowledgeArticle>;

type Ticket = { id: string; status: string; mergedIntoTicketId?: string | null; visibility?: 'staff' | 'public' };

const baseProblem = {
  id: 'p1',
  sequence: 12,
  title: 'Printer queue stalls',
  status: 'KNOWN_ERROR',
  description: 'Jobs from Ana Anić (ana.anic@example.com) hang, call 033 123 456.',
  rootCause: 'Spooler leak',
  workaround: 'Restart the spooler',
  resolution: null as string | null,
  serviceId: 's1',
  organizationalUnitId: 'ou1',
  ownerUserId: 'owner',
  createdByUserId: 'creator',
  knowledgeArticleId: null as string | null,
};

function setup(options: { problem?: Partial<typeof baseProblem>; tickets?: Ticket[]; canClose?: boolean; max?: number; closeCodes?: { enabled: boolean; requireOnResolve: boolean; allowedCodes: string[] } }) {
  const problem = { ...baseProblem, ...options.problem };
  const events: { action: string; detail: unknown }[] = [];
  const tickets = options.tickets ?? [];
  const prisma: Record<string, unknown> = {
    problem: {
      findFirst: jest.fn(async () => problem),
      updateMany: jest.fn(async () => ({ count: problem.knowledgeArticleId === null ? 1 : 0 })),
    },
    problemTicket: {
      findMany: jest.fn(async (args: { select: { ticket: { select: Record<string, unknown> } } }) =>
        'requesterId' in args.select.ticket.select
          ? [{ ticket: { requesterId: 'requester' } }]
          : tickets.map((ticket) => ({
              ticket: { id: ticket.id, ticketNumber: `T-${ticket.id}`, title: ticket.id, status: ticket.status, isConfidential: false, mergedIntoTicketId: ticket.mergedIntoTicketId ?? null },
            })),
      ),
    },
    user: {
      findMany: jest.fn(async () => [{ email: 'ana.anic@example.com', displayName: 'Ana Anić', distinguishedName: null }]),
      findUnique: jest.fn(async () => ({ preferredLocale: 'bs' })),
    },
    problemEvent: { create: jest.fn(async ({ data }: { data: { action: string; detail: unknown } }) => events.push(data)) },
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(prisma)),
  };
  loadTicket.mockImplementation(async (_prisma, _loader, ticketId) => {
    const ticket = tickets.find((candidate) => candidate.id === ticketId);
    if (ticket === undefined) throw new Error('NOT_FOUND');
    return { ticket: ticket as never, access: { visibility: ticket.visibility ?? 'staff' } } as never;
  });
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    hasPermission: jest.fn((_viewer: unknown, key: string) => key !== 'problem.close' || options.canClose !== false),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-', bulkResolveMax: options.max ?? 200 })),
    requireGroupAuthority: jest.fn(async () => undefined),
  };
  const ticketsService = { takeOverForProblem: jest.fn(async (_id: string, _input: unknown) => ({})), update: jest.fn(async (id: string) => { if (id === 'fail') throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION' }); }) };
  const collaboration = { createMessage: jest.fn(async () => ({})) };
  const closeCodes = { load: jest.fn(async () => options.closeCodes ?? { enabled: false, requireOnResolve: false, allowedCodes: [] }) };
  const service = new ProblemResolutionService(
    prisma as never,
    access as never,
    {} as never,
    { bind: jest.fn(async (context: unknown) => context) } as never,
    ticketsService as never,
    collaboration as never,
    closeCodes as never,
  );
  return { service, events, ticketsService, collaboration, prisma };
}

const viewer = { userId: 'u1' } as never;

describe('buildKnownErrorArticle', () => {
  it('builds symptoms, cause and workaround sections, with the fix only when present', () => {
    const bs = buildKnownErrorArticle({ ...baseProblem, workaround: null }, 'bs');
    expect(bs.body).toBe('Simptomi\n' + baseProblem.description + '\n\nUzrok\nSpooler leak\n\nZaobilazno rješenje\n(nije navedeno)');
    const en = buildKnownErrorArticle({ ...baseProblem, resolution: 'Patched' }, 'en');
    expect(en.body.endsWith('Permanent fix\nPatched')).toBe(true);
  });
});

describe('ticketFailureCode', () => {
  it('reads the HTTP body code, the domain code or falls back', () => {
    expect(ticketFailureCode(new ConflictException({ code: 'X' }))).toBe('X');
    expect(ticketFailureCode({ code: 'Y' })).toBe('Y');
    expect(ticketFailureCode(new Error('boom'))).toBe('TICKET_OPERATION_FAILED');
  });
});

describe('ProblemResolutionService article', () => {
  it('drafts the article with personal data replaced', async () => {
    const { service } = setup({});
    const draft = await service.articleDraft('p1', viewer);
    expect(draft.body).not.toContain('ana.anic@example.com');
    expect(draft.body).not.toContain('Ana Anić');
    expect(draft.body).toContain('[korisnik]');
    expect(draft.replacements.email).toBe(1);
    expect(draft.replacements.phone).toBe(1);
    expect(draft.serviceId).toBe('s1');
  });

  it('rejects problems that are not a known error or already have an article', async () => {
    await expect(setup({ problem: { status: 'INVESTIGATING' } }).service.articleDraft('p1', viewer)).rejects.toMatchObject({ code: problemErrorCodes.statusTransition });
    await expect(setup({ problem: { knowledgeArticleId: 'a0' } }).service.articleDraft('p1', viewer)).rejects.toMatchObject({ code: problemErrorCodes.articleExists });
  });

  it('creates the article, links it and records the event', async () => {
    createArticle.mockResolvedValueOnce({ id: 'a1', title: 'T', status: 'DRAFT' } as never);
    const { service, events } = setup({});
    const result = await service.createArticle('p1', { title: 'T', body: 'B', serviceId: 's1', organizationalUnitId: 'ou1' }, viewer);
    expect(result).toEqual({ id: 'a1', title: 'T', status: 'DRAFT' });
    expect(events.map((event) => event.action)).toEqual(['knowledge_article']);
  });
});

describe('ProblemResolutionService group resolution', () => {
  const tickets: Ticket[] = [
    { id: 'a', status: 'IN_PROGRESS' },
    { id: 'w', status: 'WAITING_FOR_USER' },
    { id: 'p', status: 'PENDING_APPROVAL' },
    { id: 'm', status: 'ASSIGNED', mergedIntoTicketId: 'a' },
    // Outside the resolver's own ticket access (another unit): resolved via problem.close.
    { id: 'x', status: 'PENDING', visibility: 'public' },
    { id: 'fail', status: 'ASSIGNED' },
    { id: 'b', status: 'ASSIGNED' },
  ];

  it('previews resolvable tickets with skip reasons and the limit', async () => {
    const { service } = setup({ tickets, max: 2 });
    const preview = await service.resolvePreview('p1', viewer);
    expect(preview.items.map((item) => [item.id, item.reason])).toEqual([
      ['a', null],
      ['w', 'waiting_for_user'],
      ['p', 'pending_approval'],
      ['m', 'merged'],
      ['x', null],
      ['fail', 'limit'],
      ['b', 'limit'],
    ]);
    expect(preview.resolvable).toBe(2);
  });

  it('needs problem.close, a message and a required close code', async () => {
    await expect(setup({ canClose: false }).service.resolvePreview('p1', viewer)).rejects.toBeInstanceOf(ProblemError);
    await expect(setup({}).service.assertResolveOptions('p1', viewer, { message: 'ok' })).rejects.toMatchObject({ detail: 'message' });
    const required = setup({ closeCodes: { enabled: true, requireOnResolve: true, allowedCodes: ['fixed'] } }).service;
    await expect(required.assertResolveOptions('p1', viewer, { message: 'Riješeno je.' })).rejects.toMatchObject({ detail: 'closeCode' });
    await expect(required.assertResolveOptions('p1', viewer, { message: 'Riješeno je.', closeCode: 'other' })).rejects.toMatchObject({ detail: 'closeCode' });
    await expect(required.assertResolveOptions('p1', viewer, { message: 'Riješeno je.', closeCode: 'fixed' })).resolves.toBeUndefined();
  });

  it('takes over unstarted tickets, resolves status first, then replies; failures do not stop the rest', async () => {
    const { service, ticketsService, collaboration, events } = setup({ tickets, problem: { status: 'RESOLVED' } });
    const result = await service.resolveTickets('p1', viewer, { message: ' Uzrok je otklonjen. ' });
    expect(result.resolved.map((item) => item.ticketId)).toEqual(['a', 'x', 'b']);
    expect(ticketsService.takeOverForProblem.mock.calls.map((call) => call[0])).toEqual(['x', 'fail', 'b']);
    expect(ticketsService.takeOverForProblem).toHaveBeenCalledWith('x', { actorUserId: 'u1', problemDetail: 'p1|P-000012 ' + baseProblem.title });
    expect(result.failed).toEqual([{ ticketId: 'fail', ticketNumber: 'T-fail', code: 'INVALID_STATUS_TRANSITION' }]);
    expect(result.skipped).toHaveLength(3);
    expect(ticketsService.update).toHaveBeenCalledWith('a', { status: 'RESOLVED', closeCode: undefined, resolutionNote: 'P-000012' }, { actorUserId: 'u1', problemDelegation: { problemId: 'p1' } });
    expect(collaboration.createMessage).toHaveBeenCalledTimes(3);
    expect(collaboration.createMessage).toHaveBeenCalledWith('a', { type: 'AGENT_REPLY', body: 'Uzrok je otklonjen.' }, { actorUserId: 'u1', problemDelegation: { problemId: 'p1' } });
    expect(events).toEqual([{ problemId: 'p1', action: 'tickets_resolved', actorUserId: 'u1', detail: { resolved: 3, skipped: 3, failed: 1 } }]);
  });

  it('refuses to resolve tickets of a problem that is not resolved', async () => {
    await expect(setup({ tickets }).service.resolveTickets('p1', viewer, { message: 'Uzrok je otklonjen.' })).rejects.toMatchObject({ code: problemErrorCodes.statusTransition });
  });
});
