import { ForbiddenException } from '@nestjs/common';
import { ProblemResolutionRunService } from './problem-resolution-run.service';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { assertProblemDelegation } from '../tickets/problem-delegation';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { prepareAuditEntry } from '../audit-log/audit-event-policy';
import { auditLogActions } from '../audit-log/audit-log.constants';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/tickets.service', () => ({ TicketsService: class TicketsService {} }));
jest.mock('../tickets/tickets-collaboration.service', () => ({ TicketsCollaborationService: class TicketsCollaborationService {} }));
jest.mock('../tickets/close-codes/ticket-close-codes-configuration.loader', () => ({ TicketCloseCodesConfigurationLoader: class TicketCloseCodesConfigurationLoader {} }));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problems.service', () => ({ ProblemsService: class ProblemsService {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => ({ id: { not: 'x' } })) }));
jest.mock('../tickets/load-accessible-ticket', () => ({ loadAccessibleTicket: jest.fn() }));
jest.mock('../tickets/problem-delegation', () => ({ assertProblemDelegation: jest.fn(async () => undefined) }));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

const loadTicket = loadAccessibleTicket as jest.MockedFunction<typeof loadAccessibleTicket>;
const audit = recordAuditEntry as jest.MockedFunction<typeof recordAuditEntry>;

beforeEach(() => {
  audit.mockReset();
  audit.mockImplementation(async (_transaction, input) => {
    prepareAuditEntry(input);
  });
  (assertProblemDelegation as jest.Mock).mockReset();
  (assertProblemDelegation as jest.Mock).mockImplementation(async () => undefined);
});

type Ticket = {
  id: string;
  status: string;
  mergedIntoTicketId?: string | null;
  visibility?: 'staff' | 'public';
  isConfidential?: boolean;
  noOwnAccess?: boolean;
};

type RunRow = {
  id: string;
  problemId: string;
  actorUserId: string;
  requestHash: string;
  status: string;
  number: string | null;
  message: string;
  closeCode: string | null;
  total: number;
  resolved: number;
  messageFailed: number;
  failed: number;
  skipped: number;
  responseBody: unknown;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type ItemRow = {
  id: string;
  runId: string;
  ticketId: string;
  ticketNumber: string;
  ordinal: number;
  status: string;
  reason: string | null;
  errorCode: string | null;
  retryable: boolean | null;
  messageSent: boolean;
  attempts: number;
  completedAt: Date | null;
};

const baseProblem = {
  id: 'p1',
  sequence: 12,
  title: 'Printer queue stalls',
  status: 'KNOWN_ERROR',
  version: 1,
  resolution: null as string | null,
  groupId: 'g1',
  organizationalUnitId: 'ou1',
};

function setup(
  options: {
    problem?: Partial<typeof baseProblem>;
    tickets?: Ticket[];
    canClose?: boolean;
    max?: number;
    closeCodes?: { enabled: boolean; requireOnResolve: boolean; allowedCodes: string[] };
    failUpdate?: Record<string, Error>;
    failMessage?: Record<string, Error>;
  } = {},
) {
  const problem = { ...baseProblem, ...options.problem };
  const tickets = options.tickets ?? [];
  const runs = new Map<string, RunRow>();
  const items = new Map<string, ItemRow>();
  const events: { action: string; detail: unknown }[] = [];
  let itemSequence = 0;

  const now = () => new Date('2027-11-30T00:00:00.000Z');

  const prisma: Record<string, unknown> = {
    problem: {
      findFirst: jest.fn(async () => ({ ...problem })),
      findUnique: jest.fn(async () => ({ version: problem.version, status: problem.status, organizationalUnitId: problem.organizationalUnitId })),
    },
    ticket: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const ticket = tickets.find((candidate) => candidate.id === where.id);
        if (ticket === undefined) return null;
        return {
          status: ticket.status,
          isConfidential: ticket.isConfidential ?? false,
          mergedIntoTicketId: ticket.mergedIntoTicketId ?? null,
        };
      }),
    },
    problemTicket: {
      findMany: jest.fn(async () =>
        tickets
          .filter((ticket) => ticket.id !== 'x')
          .map((ticket) => ({
            ticket: {
              id: ticket.id,
              ticketNumber: `T-${ticket.id}`,
              title: ticket.id,
              status: ticket.status,
              isConfidential: ticket.isConfidential ?? false,
              mergedIntoTicketId: ticket.mergedIntoTicketId ?? null,
            },
          })),
      ),
    },
    problemResolutionRun: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> & { items?: { create: Record<string, unknown>[] } } }) => {
        const { items: itemData, ...rest } = data;
        const row: RunRow = {
          id: rest.id as string,
          problemId: rest.problemId as string,
          actorUserId: rest.actorUserId as string,
          requestHash: rest.requestHash as string,
          status: 'PROCESSING',
          number: (rest.number as string | null) ?? null,
          message: rest.message as string,
          closeCode: (rest.closeCode as string | null) ?? null,
          total: rest.total as number,
          resolved: 0,
          messageFailed: 0,
          failed: 0,
          skipped: 0,
          responseBody: null,
          lastError: null,
          createdAt: now(),
          updatedAt: now(),
          completedAt: null,
        };
        runs.set(row.id, row);
        for (const entry of itemData?.create ?? []) {
          itemSequence += 1;
          const item: ItemRow = {
            id: `item-${itemSequence}`,
            runId: row.id,
            ticketId: entry.ticketId as string,
            ticketNumber: entry.ticketNumber as string,
            ordinal: entry.ordinal as number,
            status: entry.status as string,
            reason: (entry.reason as string | null) ?? null,
            errorCode: null,
            retryable: null,
            messageSent: false,
            attempts: 0,
            completedAt: (entry.completedAt as Date | null) ?? null,
          };
          items.set(item.id, item);
        }
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = runs.get(where.id);
        if (row === undefined) return null;
        return { ...row, items: [...items.values()].filter((item) => item.runId === row.id).sort((a, b) => a.ordinal - b.ordinal) };
      }),
      findFirst: jest.fn(async () => {
        const rows = [...runs.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] === undefined ? null : { id: rows[0].id };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = runs.get(where.id);
        if (row === undefined) throw new Error('missing run');
        Object.assign(row, data, { updatedAt: now() });
        return row;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: string | { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          const row = runs.get(where.id);
          if (row === undefined) return { count: 0 };
          if (typeof where.status === 'string' && where.status !== row.status) return { count: 0 };
          if (typeof where.status === 'object' && where.status !== null && !where.status.in.includes(row.status)) {
            return { count: 0 };
          }
          Object.assign(row, data, { updatedAt: now() });
          return { count: 1 };
        },
      ),
    },
    problemResolutionRunItem: {
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const item = items.get(where.id);
        if (item === undefined || item.status !== where.status) return { count: 0 };
        const attempts = data.attempts as { increment?: number } | undefined;
        Object.assign(item, { ...data, attempts: item.attempts + (attempts?.increment ?? 0) });
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = items.get(where.id);
        if (item === undefined) throw new Error('missing item');
        Object.assign(item, data);
        return item;
      }),
    },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: { action: string; detail: unknown } }) => {
        events.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (run: (transaction: unknown) => Promise<unknown>) => run(prisma)),
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
  const ticketsService = {
    takeOverForProblem: jest.fn(async () => ({})),
    update: jest.fn(async (id: string) => {
      const failure = options.failUpdate?.[id];
      if (failure !== undefined) throw failure;
      const ticket = tickets.find((candidate) => candidate.id === id);
      if (ticket !== undefined) ticket.status = 'RESOLVED';
      return {};
    }),
  };
  const collaboration = {
    createMessage: jest.fn(async (ticketId: string) => {
      const failure = options.failMessage?.[ticketId];
      if (failure !== undefined) throw failure;
      return {};
    }),
  };
  const closeCodes = { load: jest.fn(async () => options.closeCodes ?? { enabled: false, requireOnResolve: false, allowedCodes: [] }) };
  const problems = {
    changeStatus: jest.fn(async (_viewer: unknown, _id: string, input: { version: number; status: string }) => {
      problem.status = input.status;
      problem.version += 1;
      return {};
    }),
  };
  const service = new ProblemResolutionRunService(
    prisma as never,
    access as never,
    {} as never,
    { bind: jest.fn(async (context: unknown) => context) } as never,
    ticketsService as never,
    collaboration as never,
    closeCodes as never,
    problems as never,
  );
  return { service, prisma, runs, items, events, ticketsService, collaboration, problems, access, problem };
}

const viewer = { userId: 'u1' } as never;
const runId = '11111111-1111-4111-8111-111111111111';

describe('ProblemResolutionRunService prepare', () => {
  it('stores one item per linked ticket with the skip reasons of the preview', async () => {
    const { service, items } = setup({
      tickets: [
        { id: 'a', status: 'IN_PROGRESS' },
        { id: 'w', status: 'WAITING_FOR_USER' },
        { id: 'c', status: 'ASSIGNED', isConfidential: true, noOwnAccess: true },
      ],
      max: 5,
    });
    const prepared = await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    expect(prepared).toEqual({ runId, replay: null, status: 'PROCESSING', canResume: true });
    expect([...items.values()].map((item) => [item.ticketId, item.status, item.reason])).toEqual([
      ['a', 'PENDING', null],
      ['w', 'SKIPPED', 'waiting_for_user'],
      ['c', 'SKIPPED', 'no_access'],
    ]);
  });

  it('replays the same key and payload, rejects another payload, and hides a foreign problem', async () => {
    const { service, items } = setup({ tickets: [{ id: 'a', status: 'IN_PROGRESS' }], problem: { status: 'RESOLVED' } });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    const again = await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    expect(again).toMatchObject({ runId, replay: null, canResume: true });
    expect(items.size).toBe(1);
    await expect(service.prepare('p1', viewer, { runId, message: 'Nešto drugo.' })).rejects.toMatchObject({
      code: problemErrorCodes.resolutionRunConflict,
    });
    await expect(service.prepare('p2', viewer, { runId, message: 'Uzrok je otklonjen.' })).rejects.toMatchObject({
      code: problemErrorCodes.notFound,
    });
  });

  it('does not start a new run on an already resolved or finished problem', async () => {
    const { service } = setup({ tickets: [], problem: { status: 'RESOLVED' } });
    await expect(service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' })).rejects.toMatchObject({
      code: problemErrorCodes.statusTransition,
    });
  });

  it('needs a message and the required close code before writing anything', async () => {
    const missing = setup({ tickets: [] });
    await expect(missing.service.prepare('p1', viewer, { runId, message: 'ok' })).rejects.toMatchObject({ detail: 'message' });
    expect(missing.runs.size).toBe(0);
    const required = setup({ tickets: [], closeCodes: { enabled: true, requireOnResolve: true, allowedCodes: ['fixed'] } });
    await expect(required.service.prepare('p1', viewer, { runId, message: 'Riješeno je.' })).rejects.toMatchObject({ detail: 'closeCode' });
    await expect(required.service.prepare('p1', viewer, { runId, message: 'Riješeno je.', closeCode: 'other' })).rejects.toMatchObject({
      detail: 'closeCode',
    });
    await expect(required.service.prepare('p1', viewer, { runId, message: 'Riješeno je.', closeCode: 'fixed' })).resolves.toMatchObject({
      status: 'PROCESSING',
    });
  });
});

describe('ProblemResolutionRunService execute', () => {
  it('resolves the problem first, then every pending ticket with a stable reply key', async () => {
    const { service, problems, ticketsService, collaboration, events, runs } = setup({
      tickets: [
        { id: 'a', status: 'IN_PROGRESS' },
        { id: 'b', status: 'PENDING' },
        { id: 'w', status: 'WAITING_FOR_USER' },
      ],
    });
    await service.prepare('p1', viewer, { runId, message: ' Uzrok je otklonjen. ' });
    const outcome = await service.execute('p1', viewer, runId);
    expect(problems.changeStatus).toHaveBeenCalledWith(viewer, 'p1', { version: 1, status: 'RESOLVED' });
    expect(outcome.status).toBe('SUCCEEDED');
    expect(outcome.canResume).toBe(false);
    expect(outcome.resolved.map((item) => item.ticketId)).toEqual(['a', 'b']);
    expect(outcome.skipped).toEqual([{ ticketId: 'w', ticketNumber: 'T-w', reason: 'waiting_for_user' }]);
    expect(ticketsService.takeOverForProblem).toHaveBeenCalledWith('b', { actorUserId: 'u1' });
    expect(ticketsService.update).toHaveBeenCalledWith(
      'a',
      { status: 'RESOLVED', closeCode: undefined, resolutionNote: 'P-000012' },
      { actorUserId: 'u1', problemDelegation: { problemId: 'p1' } },
    );
    expect(collaboration.createMessage).toHaveBeenCalledWith(
      'a',
      { type: 'AGENT_REPLY', body: 'Uzrok je otklonjen.', idempotencyKey: `${runId}:a` },
      { actorUserId: 'u1', problemDelegation: { problemId: 'p1' } },
    );
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ resolved: 2, skipped: 1, failed: 0, runId });
    expect(runs.get(runId)).toMatchObject({ status: 'SUCCEEDED', resolved: 2, skipped: 1, failed: 0, messageFailed: 0 });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: auditLogActions.problemTicketsResolved, organizationalUnitId: 'ou1' }),
    );
  });

  it('keeps the other tickets going when one fails, and only retries the retryable ones', async () => {
    const { service, ticketsService, collaboration, items } = setup({
      tickets: [
        { id: 'a', status: 'IN_PROGRESS' },
        { id: 'b', status: 'IN_PROGRESS' },
      ],
      failUpdate: { a: new Error('deadlock'), b: new ForbiddenException({ code: 'FORBIDDEN' }) },
    });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    const first = await service.execute('p1', viewer, runId);
    expect(first.status).toBe('PARTIAL');
    expect(first.canResume).toBe(true);
    expect(first.failed).toEqual([
      { ticketId: 'a', ticketNumber: 'T-a', code: 'TICKET_OPERATION_FAILED' },
      { ticketId: 'b', ticketNumber: 'T-b', code: 'FORBIDDEN' },
    ]);
    expect(items.get('item-1')).toMatchObject({ status: 'FAILED', retryable: true });
    expect(items.get('item-2')).toMatchObject({ status: 'FAILED', retryable: false });

    // Resume retries only the transient one; the permanent failure stays as it is.
    (ticketsService.update as jest.Mock).mockImplementation(async (id: string) => {
      if (id === 'a') return {};
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    });
    const second = await service.resume('p1', viewer, runId);
    expect(second.resolved.map((item) => item.ticketId)).toEqual(['a']);
    expect(items.get('item-1')?.attempts).toBe(2);
    expect(items.get('item-2')?.attempts).toBe(1);
    expect(collaboration.createMessage).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('PARTIAL');
    expect(second.canResume).toBe(false);
  });

  it('stores a pending reply and resumes with the same key when the message failed', async () => {
    const { service, collaboration, items } = setup({
      tickets: [{ id: 'a', status: 'IN_PROGRESS' }],
      failMessage: { a: new Error('smtp down') },
    });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    const first = await service.execute('p1', viewer, runId);
    expect(first.status).toBe('PARTIAL');
    expect(first.canResume).toBe(true);
    expect(first.messagePending).toBe(1);
    expect(first.resolved).toEqual([{ ticketId: 'a', ticketNumber: 'T-a', messageSent: false }]);
    expect(items.get('item-1')).toMatchObject({ status: 'MESSAGE_PENDING', retryable: true, messageSent: false });

    (collaboration.createMessage as jest.Mock).mockImplementation(async () => ({}));
    const second = await service.resume('p1', viewer, runId);
    expect(second.status).toBe('SUCCEEDED');
    expect(second.resolved).toEqual([{ ticketId: 'a', ticketNumber: 'T-a', messageSent: true }]);
    expect(collaboration.createMessage).toHaveBeenLastCalledWith(
      'a',
      { type: 'AGENT_REPLY', body: 'Uzrok je otklonjen.', idempotencyKey: `${runId}:a` },
      { actorUserId: 'u1', problemDelegation: { problemId: 'p1' } },
    );
  });

  it('finishes a crashed attempt without resolving the ticket twice', async () => {
    const { service, ticketsService, collaboration, items } = setup({ tickets: [{ id: 'a', status: 'RESOLVED' }] });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    // A crash left the item claimed while the ticket write had already landed.
    Object.assign(items.get('item-1') as ItemRow, { status: 'RUNNING', attempts: 1 });
    const outcome = await service.resume('p1', viewer, runId);
    expect(ticketsService.update).not.toHaveBeenCalled();
    expect(collaboration.createMessage).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('SUCCEEDED');
    expect(items.get('item-1')).toMatchObject({ status: 'RESOLVED', messageSent: true, attempts: 2 });
  });

  it('replays a finished run without writing anything again', async () => {
    const { service, ticketsService, collaboration } = setup({ tickets: [{ id: 'a', status: 'IN_PROGRESS' }] });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    const first = await service.execute('p1', viewer, runId);
    const second = await service.execute('p1', viewer, runId);
    expect(second).toEqual(first);
    expect(ticketsService.update).toHaveBeenCalledTimes(1);
    expect(collaboration.createMessage).toHaveBeenCalledTimes(1);
    const prepared = await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    expect(prepared.replay).toEqual(first);
    expect(prepared.canResume).toBe(false);
  });

  it('never delegates confidential tickets and re-proves the delegation on a takeover', async () => {
    const { service, ticketsService, collaboration } = setup({
      tickets: [
        { id: 'c1', status: 'PENDING', isConfidential: true },
        { id: 'c2', status: 'PENDING' },
      ],
    });
    (assertProblemDelegation as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('FORBIDDEN');
    });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    const outcome = await service.execute('p1', viewer, runId);
    expect(loadTicket).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'c1', expect.anything(), { writable: true });
    expect(ticketsService.takeOverForProblem).not.toHaveBeenCalledWith('c2', expect.anything());
    expect(outcome.failed).toEqual([{ ticketId: 'c2', ticketNumber: 'T-c2', code: 'TICKET_OPERATION_FAILED' }]);
    expect(outcome.resolved.map((item) => item.ticketId)).toEqual(['c1']);
    expect(collaboration.createMessage).toHaveBeenCalledTimes(1);
  });
});

describe('ProblemResolutionRunService status', () => {
  it('reports the newest run with its resumable state and hides nothing behind a reload', async () => {
    const { service, items } = setup({ tickets: [{ id: 'a', status: 'IN_PROGRESS' }], failMessage: { a: new Error('smtp down') } });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    await service.execute('p1', viewer, runId);
    const latest = await service.latest('p1', viewer);
    expect(latest.run).toMatchObject({ id: runId, status: 'PARTIAL', canResume: true, total: 1, resolved: 0, messagePending: 1 });
    expect(latest.run?.items).toHaveLength(1);
    expect(items.get('item-1')?.status).toBe('MESSAGE_PENDING');
  });

  it('marks an aborted run as failed and refuses to resume it', async () => {
    const { service } = setup({ tickets: [{ id: 'a', status: 'IN_PROGRESS' }] });
    await service.prepare('p1', viewer, { runId, message: 'Uzrok je otklonjen.' });
    await service.abort(runId, 'PROBLEM_VERSION_CONFLICT');
    await expect(service.execute('p1', viewer, runId)).rejects.toBeInstanceOf(ProblemError);
    await expect(service.resume('p1', viewer, runId)).rejects.toMatchObject({ code: problemErrorCodes.resolutionRunClosed });
    const latest = await service.latest('p1', viewer);
    expect(latest.run).toMatchObject({ status: 'FAILED', canResume: false });
  });
});
