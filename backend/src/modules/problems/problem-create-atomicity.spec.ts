import { ProblemsService } from './problems.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authorization/authorization-context.loader', () => ({ AuthorizationContextLoader: class AuthorizationContextLoader {} }));
jest.mock('../tickets/ticket-access-policy-binder', () => ({ TicketAccessPolicyBinder: class TicketAccessPolicyBinder {} }));
jest.mock('../tickets/priority/ticket-priority-matrix-configuration.loader', () => ({
  TicketPriorityMatrixConfigurationLoader: class TicketPriorityMatrixConfigurationLoader {},
}));
jest.mock('./problem-access.service', () => ({ ProblemAccessService: class ProblemAccessService {} }));
jest.mock('./problem-notifier', () => ({ ProblemNotifier: class ProblemNotifier {} }));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => ({ id: { in: ['t1'] } })) }));
jest.mock('../tickets/resolve-ticket-priority', () => ({ resolveTicketPriority: jest.fn(async () => 'MEDIUM') }));
jest.mock('./problem-target', () => ({
  computeProblemTarget: jest.fn(async () => null),
  isTargetOverdue: jest.fn(() => false),
  isTargetRunning: jest.fn(() => true),
}));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

const viewer = { userId: 'u1' } as never;

type TicketLinkResult = {
  linked: { ticketId: string; ticketNumber: string }[];
  skipped: { ticketId: string; ticketNumber: string | null; reason: string }[];
};

/**
 * W7.26 / BA-problems-08: creating a problem and linking its first tickets is
 * one transaction, and a repeated `clientRequestId` replays the problem.
 */
function setup(options: {
  linkResult?: TicketLinkResult;
  existingProblemId?: string | null;
  transactionError?: unknown;
}) {
  const db = { problems: [] as { id: string; sequence: number }[], events: [] as unknown[], sequence: 0 };
  const transaction = {
    $queryRaw: jest.fn(async () => {
      db.sequence += 1;
      return [{ lastNumber: db.sequence }];
    }),
    problem: {
      create: jest.fn(async ({ data }: { data: { sequence: number } }) => {
        const row = { id: `p${db.problems.length + 1}`, sequence: data.sequence };
        db.problems.push(row);
        return { id: row.id };
      }),
    },
    problemEvent: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        db.events.push(data);
      }),
    },
  };
  const findUnique = jest.fn(async () => (options.existingProblemId == null ? null : { id: options.existingProblemId }));
  const prisma = {
    ...transaction,
    problem: { ...transaction.problem, findUnique },
    group: { findUnique: jest.fn(async () => ({ isProblemGroup: true })) },
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => {
      // Rollback: a failed command leaves neither the problem nor the consumed
      // sequence number behind.
      const snapshot = structuredClone(db);
      try {
        if (options.transactionError !== undefined) throw options.transactionError;
        return await run(transaction);
      } catch (error) {
        Object.assign(db, snapshot);
        throw error;
      }
    }),
  };
  const access = {
    require: jest.fn(async () => ({ all: true, paths: [] })),
    configuration: jest.fn(async () => ({ numberPrefix: 'P-' })),
    requireUnitInScope: jest.fn(async () => undefined),
    hasPermission: jest.fn(() => true),
    scopeOf: jest.fn(async () => ({ all: true, paths: [] })),
  };
  const notices = [{ ticket: { id: 't1' }, messages: [] }];
  const ticketLinks = {
    linkInTransaction: jest.fn(async () => ({
      result: options.linkResult ?? { linked: [{ ticketId: 't1', ticketNumber: 'T-1' }], skipped: [] },
      notices,
    })),
    publish: jest.fn(),
    linkedTickets: jest.fn(async () => ({ linked: [{ ticketId: 't1', ticketNumber: 'T-1' }], skipped: [] })),
  };
  const service = new ProblemsService(prisma as never, access as never, {} as never, {} as never, ticketLinks as never);
  const get = jest.spyOn(service, 'get').mockResolvedValue({ id: 'p1', number: 'P-000001', ticketCount: 1 } as never);
  return { service, prisma, transaction, ticketLinks, db, get, findUnique, notices };
}

const input = {
  title: 'Mreža u zgradi A',
  description: 'Prekidi svakih deset minuta.',
  groupId: 'g1',
  organizationalUnitId: 'ou1',
  ticketIds: ['t1', 't2'],
};

describe('ProblemsService.create atomicity (W7.26)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links the first tickets inside the create transaction and reports partial skips', async () => {
    const skipped = [{ ticketId: 't2', ticketNumber: null, reason: 'not_found' }];
    const { service, prisma, transaction, ticketLinks, notices } = setup({
      linkResult: { linked: [{ ticketId: 't1', ticketNumber: 'T-1' }], skipped },
    });
    const result = await service.create(viewer, input as never);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The same transaction client writes the problem and the links.
    expect(ticketLinks.linkInTransaction).toHaveBeenCalledWith(transaction, { id: 'p1', status: 'NEW' }, ['t1', 't2'], viewer);
    expect(result).toMatchObject({ id: 'p1', ticketLinks: { linked: [{ ticketId: 't1' }], skipped } });
    // Realtime events are published only after the commit.
    expect(ticketLinks.publish).toHaveBeenCalledWith(notices);
    // No idempotency lookup without a key.
    expect(prisma.problem.findUnique).not.toHaveBeenCalled();
  });

  it('rolls the whole command back when no selected ticket can be linked', async () => {
    const skipped = [
      { ticketId: 't1', ticketNumber: 'T-1', reason: 'other_problem' },
      { ticketId: 't2', ticketNumber: null, reason: 'not_found' },
    ];
    const { service, prisma, ticketLinks, db } = setup({ linkResult: { linked: [], skipped } });
    await expect(service.create(viewer, input as never)).rejects.toEqual(
      new ProblemError(problemErrorCodes.ticketsNotLinked, 'ticketIds'),
    );
    // No orphan problem, no history row and no consumed sequence number.
    expect(db.problems).toHaveLength(0);
    expect(db.events).toHaveLength(0);
    expect(db.sequence).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ticketLinks.publish).not.toHaveBeenCalled();
  });

  it('keeps ticketLinks null when no ticket was selected', async () => {
    const { service, prisma, ticketLinks } = setup({});
    const result = await service.create(viewer, { ...input, ticketIds: undefined } as never);
    expect(result).toMatchObject({ id: 'p1', ticketLinks: null });
    expect(ticketLinks.linkInTransaction).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('replays the stored problem for a repeated clientRequestId without writing again', async () => {
    const { service, prisma, ticketLinks, get, findUnique } = setup({ existingProblemId: 'p9' });
    const clientRequestId = '11111111-1111-4111-8111-111111111111';
    const result = await service.create(viewer, { ...input, clientRequestId } as never);
    expect(findUnique).toHaveBeenCalledWith({
      where: { createdByUserId_clientRequestId: { createdByUserId: 'u1', clientRequestId } },
      select: { id: true },
    });
    expect(get).toHaveBeenCalledWith(viewer, 'p9');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ticketLinks.linkInTransaction).not.toHaveBeenCalled();
    expect(ticketLinks.linkedTickets).toHaveBeenCalledWith('p9');
    expect(result).toMatchObject({ id: 'p1', ticketLinks: { linked: [{ ticketId: 't1' }] } });
  });

  it('replays the winner when a concurrent create loses the unique-key race', async () => {
    const { service, prisma, findUnique } = setup({ transactionError: { code: 'P2002' } });
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p9' });
    const result = await service.create(viewer, { ...input, clientRequestId: '22222222-2222-4222-8222-222222222222' } as never);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ id: 'p1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not swallow an unrelated failure of the create transaction', async () => {
    const { service } = setup({ transactionError: new Error('database is down') });
    await expect(service.create(viewer, { ...input, clientRequestId: '33333333-3333-4333-8333-333333333333' } as never)).rejects.toThrow(
      'database is down',
    );
  });
});
