import { ConflictException } from '@nestjs/common';
import { buildKnownErrorArticle } from './problem-article';
import { ProblemResolutionService, ticketFailureCode } from './problem-resolution.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { createKnowledgeArticle } from '../knowledge-base/create-knowledge-article';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { prepareAuditEntry } from '../audit-log/audit-event-policy';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { problemTicketVisibility } from './problem-ticket-visibility';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/tickets.service', () => ({ TicketsService: class TicketsService {} }));
jest.mock('../tickets/tickets-collaboration.service', () => ({ TicketsCollaborationService: class TicketsCollaborationService {} }));
jest.mock('../tickets/close-codes/ticket-close-codes-configuration.loader', () => ({ TicketCloseCodesConfigurationLoader: class TicketCloseCodesConfigurationLoader {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => ({ id: { not: 'x' } })) }));

jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('../knowledge-base/create-knowledge-article', () => ({ createKnowledgeArticle: jest.fn() }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

const loadTicket = loadAccessibleTicket as jest.MockedFunction<typeof loadAccessibleTicket>;
const createArticle = createKnowledgeArticle as jest.MockedFunction<typeof createKnowledgeArticle>;
const audit = recordAuditEntry as jest.MockedFunction<typeof recordAuditEntry>;

beforeEach(() => {
  audit.mockReset();
  audit.mockImplementation(async (_transaction, input) => { prepareAuditEntry(input); });
});

type Ticket = {
  id: string;
  status: string;
  mergedIntoTicketId?: string | null;
  visibility?: 'staff' | 'public';
  isConfidential?: boolean;
  /** The actor has no own ticket access (confidential tickets are never delegated). */
  noOwnAccess?: boolean;
};

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
          : tickets.filter((ticket) => ticket.id !== 'x').map((ticket) => ({
              ticket: { id: ticket.id, ticketNumber: `T-${ticket.id}`, title: ticket.id, status: ticket.status, isConfidential: ticket.isConfidential ?? false, mergedIntoTicketId: ticket.mergedIntoTicketId ?? null },
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
    if (ticket === undefined || ticket.noOwnAccess === true) throw new Error('FORBIDDEN');
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
  const runs = {
    assertResolveOptions: jest.fn(async () => undefined),
    resolveTickets: jest.fn(async () => ({ resolved: [], skipped: [], failed: [], runId: 'r1', status: 'SUCCEEDED' })),
  };
  const service = new ProblemResolutionService(
    prisma as never,
    access as never,
    {} as never,
    { bind: jest.fn(async (context: unknown) => context) } as never,
    closeCodes as never,
    runs as never,
  );
  return { service, events, ticketsService, collaboration, prisma, runs };
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
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: auditLogActions.problemKnowledgeArticleCreated, organizationalUnitId: 'ou1' }));
  });
});

describe('ProblemResolutionService group resolution', () => {
  const tickets: Ticket[] = [
    { id: 'a', status: 'IN_PROGRESS' },
    { id: 'w', status: 'WAITING_FOR_USER' },
    { id: 'p', status: 'PENDING_APPROVAL' },
    { id: 'm', status: 'ASSIGNED', mergedIntoTicketId: 'a' },
    // Outside the resolver's ticket read scope: not a candidate even with problem.close.
    { id: 'x', status: 'PENDING', visibility: 'public' },
    { id: 'fail', status: 'ASSIGNED' },
    { id: 'b', status: 'ASSIGNED' },
  ];

  it('previews resolvable tickets with skip reasons and the limit', async () => {
    const { service, prisma } = setup({ tickets, max: 2 });
    const preview = await service.resolvePreview('p1', viewer);
    expect(preview.items.map((item) => [item.id, item.reason])).toEqual([
      ['a', null],
      ['w', 'waiting_for_user'],
      ['p', 'pending_approval'],
      ['m', 'merged'],
      ['fail', null],
      ['b', 'limit'],
    ]);
    expect(preview.resolvable).toBe(2);
    expect((prisma.problemTicket as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ticket: { is: { AND: [{ id: { not: 'x' } }, expect.anything()] } } }), take: 2000,
    }));
  });

  it('fails closed before loading candidates when ticket policy is unavailable', async () => {
    const { service, prisma } = setup({ tickets });
    (problemTicketVisibility as jest.Mock).mockRejectedValueOnce(new Error('visibility unavailable'));
    await expect(service.resolvePreview('p1', viewer)).rejects.toThrow('visibility unavailable');
    expect((prisma.problemTicket as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
  });

  it('needs problem.close even before looking at the tickets', async () => {
    await expect(setup({ canClose: false }).service.resolvePreview('p1', viewer)).rejects.toBeInstanceOf(ProblemError);
  });

  it('delegates the options and the durable run to the run service', async () => {
    const { service, runs } = setup({});
    await service.assertResolveOptions('p1', viewer, { message: 'Riješeno je.' });
    expect(runs.assertResolveOptions).toHaveBeenCalledWith('p1', viewer, { message: 'Riješeno je.' });
    const outcome = await service.resolveTickets('p1', viewer, { message: 'Riješeno je.', runId: 'r1' });
    expect(runs.resolveTickets).toHaveBeenCalledWith('p1', viewer, { message: 'Riješeno je.', runId: 'r1' });
    expect(outcome.runId).toBe('r1');
    expect(outcome.status).toBe('SUCCEEDED');
  });
});
