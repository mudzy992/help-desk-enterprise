jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));
jest.mock('./change-downtime-outbox', () => ({ enqueueChangeDowntimeSync: jest.fn(async () => undefined) }));

import { Prisma } from '../../generated/prisma/client';
import { ChangeApprovalsService } from './change-approvals.service';
import { enqueueChangeDowntimeSync } from './change-downtime-outbox';
import { ChangeError, changeErrorCodes } from './changes.constants';

/** The downtime intent is persisted by the same transaction; its call is the proof. */
const enqueueDowntimeSync = enqueueChangeDowntimeSync as unknown as jest.Mock;

/**
 * W7.78 (`BA-changes-20`): the CAB vote contract was only covered end to end.
 * These cases pin the parts that make a vote safe under concurrency and after a
 * side effect fails: the row is unique per voter and round, the transition is
 * guarded by the version the voter read, and a notifier that dies after the
 * commit cannot undo the decision.
 */

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'voter-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };

function configuration() {
  return {
    numberPrefix: 'CHG',
    normalQuorum: 2,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: 'UTC',
  };
}

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    status: 'AUTHORIZATION',
    version: 3,
    type: 'NORMAL',
    approvalRound: 2,
    cabGroupId: 'cab-1',
    requesterUserId: 'requester',
    organizationalUnitId: 'ou-1',
    ...overrides,
  };
}

function frozenSnapshot(voters: readonly string[], quorum: number, round = 2) {
  return [{ detail: { from: 'ASSESSMENT', to: 'AUTHORIZATION', round, voterSnapshot: { round, voters, quorum } } }];
}

function buildService(options: { snapshotEvents?: unknown[]; member?: boolean; row?: Record<string, unknown> } = {}) {
  const transaction = {
    changeApproval: {
      create: jest.fn(async (): Promise<unknown> => ({ id: 'approval-1' })),
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
    },
    changeRequest: { updateMany: jest.fn(async (): Promise<{ count: number }> => ({ count: 1 })) },
    changeEvent: { create: jest.fn(async (): Promise<unknown> => ({ id: 'event-1' })) },
  };
  const prisma = {
    changeEvent: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => options.snapshotEvents ?? []),
    },
    user: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    changeApproval: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []), count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (work: (tx: unknown) => unknown): Promise<unknown> => work(transaction)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    configuration: jest.fn(async () => configuration()),
    isCabMember: jest.fn(async () => options.member ?? true),
  };
  const changes = {
    loadInScope: jest.fn(async () => changeRow(options.row)),
    get: jest.fn(async () => ({ id: 'change-1', status: 'SCHEDULED' })),
    detailLevelFor: jest.fn(async () => 'full'),
  };
  const outbox = { enqueue: jest.fn(async () => undefined) };
  const notifier = { run: jest.fn((_label: string, operation: () => Promise<unknown>) => void operation().catch(() => undefined)), decided: jest.fn(async () => undefined) };
  const service = new ChangeApprovalsService(
    prisma as never,
    access as never,
    changes as never,
    outbox as never,
    notifier as never,
  );
  return { prisma, access, changes, outbox, notifier, transaction, service };
}

async function codeOf(operation: Promise<unknown>): Promise<string | null> {
  try {
    await operation;
    return null;
  } catch (error) {
    return error instanceof ChangeError ? error.code : `UNEXPECTED: ${String(error)}`;
  }
}

describe('ChangeApprovalsService vote contract (W7.78)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses the requester before touching the round', async () => {
    const { service, prisma } = buildService({ row: { requesterUserId: 'voter-1' } });

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.notApprover,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a non-member of the CAB group', async () => {
    const { service, prisma } = buildService({ member: false });

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.notApprover,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a member who joined after the round opened (the round keeps its voter set)', async () => {
    // Dynamic CAB membership: the snapshot written when AUTHORIZATION opened holds
    // voter-2, not the viewer. Joining later cannot add a vote to this round.
    const { service, prisma } = buildService({ snapshotEvents: frozenSnapshot(['voter-2'], 1) });

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.notApprover,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses the module when the change has already left AUTHORIZATION', async () => {
    const { service, prisma } = buildService({ row: { status: 'SCHEDULED' } });

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.notInAuthorization,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a vote based on a version the voter no longer holds', async () => {
    const { service, prisma } = buildService();

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 2, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.versionConflict,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a reason with a rejection', async () => {
    const { service, prisma } = buildService();
    const short = await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'REJECTED', comment: 'ne' } as never));
    const missing = await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'REJECTED' } as never));

    expect([short, missing]).toEqual([changeErrorCodes.reasonRequired, changeErrorCodes.reasonRequired]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('turns the unique (change, round, voter) violation into CHANGE_ALREADY_VOTED', async () => {
    const { service, transaction } = buildService({ snapshotEvents: frozenSnapshot(['voter-1', 'voter-2'], 2) });
    // Two clicks, one row: the database rejects the second insert.
    // A real instance of the generated error class, so `instanceof` holds in CI and
    // in the sandbox stub alike.
    transaction.changeApproval.create.mockRejectedValueOnce(
      Object.assign(Object.create(Prisma.PrismaClientKnownRequestError.prototype) as object, {
        message: 'Unique constraint failed',
        code: 'P2002',
      }),
    );

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.alreadyVoted,
    );
    expect(transaction.changeRequest.updateMany).not.toHaveBeenCalled();
  });

  it('reports a lost race as CHANGE_VERSION_CONFLICT instead of counting the vote', async () => {
    const { service, transaction, notifier } = buildService({ snapshotEvents: frozenSnapshot(['voter-1', 'voter-2'], 2) });
    // Another voter committed between this voter's read and write: the guarded
    // update matches nothing, so this round does not move a second time.
    transaction.changeRequest.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.versionConflict,
    );
    expect(transaction.changeEvent.create).not.toHaveBeenCalled();
    expect(notifier.run).not.toHaveBeenCalled();
  });

  it('approves once the frozen quorum is reached and records the intent in the same transaction', async () => {
    const { service, transaction, notifier } = buildService({
      snapshotEvents: frozenSnapshot(['voter-1', 'voter-2'], 2),
    });
    transaction.changeApproval.findMany.mockResolvedValueOnce([
      { approverUserId: 'voter-1', decision: 'APPROVED' },
      { approverUserId: 'voter-2', decision: 'APPROVED' },
    ]);

    const result = await service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED', comment: 'Odobreno.' } as never);

    expect(result).toMatchObject({ id: 'change-1' });
    expect(transaction.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'change-1', version: 3, status: 'AUTHORIZATION' },
        data: expect.objectContaining({ status: 'SCHEDULED' }),
      }),
    );
    expect(enqueueDowntimeSync).toHaveBeenCalledWith(
      expect.anything(),
      transaction,
      expect.objectContaining({ changeId: 'change-1' }),
    );
    expect(notifier.decided).toHaveBeenCalledWith('change-1', 'APPROVED', 2, 'voter-1');
  });

  it('keeps a decision that was already committed when the notifier dies afterwards', async () => {
    const { service, transaction, notifier } = buildService({
      snapshotEvents: frozenSnapshot(['voter-1'], 1),
    });
    transaction.changeApproval.findMany.mockResolvedValueOnce([{ approverUserId: 'voter-1', decision: 'APPROVED' }]);
    notifier.decided.mockRejectedValueOnce(new Error('mail provider is down'));

    // The vote is committed; the failed notice must not turn into a failed vote and
    // must not roll the change back.
    await expect(
      service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never),
    ).resolves.toMatchObject({ id: 'change-1' });
    expect(transaction.changeRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(notifier.run).toHaveBeenCalledTimes(1);
  });

  it('does not announce anything while the round is still pending', async () => {
    const { service, transaction, notifier } = buildService({
      snapshotEvents: frozenSnapshot(['voter-1', 'voter-2', 'voter-3'], 3),
    });
    transaction.changeApproval.findMany.mockResolvedValueOnce([{ approverUserId: 'voter-1', decision: 'APPROVED' }]);

    await service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never);

    expect(transaction.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { version: { increment: 1 } } }),
    );
    expect(enqueueDowntimeSync).not.toHaveBeenCalled();
    expect(notifier.run).not.toHaveBeenCalled();
  });

  it('rejects the round on the first rejection and tells the requester', async () => {
    const { service, transaction, notifier } = buildService({
      snapshotEvents: frozenSnapshot(['voter-1', 'voter-2'], 2),
    });
    transaction.changeApproval.findMany.mockResolvedValueOnce([
      { approverUserId: 'voter-1', decision: 'REJECTED' },
      { approverUserId: 'voter-2', decision: 'APPROVED' },
    ]);

    await service.vote(viewer as never, 'change-1', { version: 3, decision: 'REJECTED', comment: 'Rizik nije opravdan.' } as never);

    expect(transaction.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
    );
    expect(notifier.decided).toHaveBeenCalledWith('change-1', 'REJECTED', 2, 'voter-1');
  });

  it('never counts a vote from outside the frozen round', async () => {
    const { service, transaction, notifier } = buildService({
      snapshotEvents: frozenSnapshot(['voter-1', 'voter-2'], 2),
    });
    // A row from a member who joined later exists (another replica wrote it), but it
    // is not part of this round's voter set, so it cannot approve anything.
    transaction.changeApproval.findMany.mockResolvedValueOnce([
      { approverUserId: 'voter-1', decision: 'APPROVED' },
      { approverUserId: 'late-member', decision: 'APPROVED' },
    ]);

    await service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never);

    expect(transaction.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { version: { increment: 1 } } }),
    );
    expect(notifier.run).not.toHaveBeenCalled();
  });

  it('stops a scoped manager outside the change scope before writing a vote', async () => {
    const { service, changes, prisma } = buildService();
    changes.loadInScope.mockRejectedValueOnce(new ChangeError(changeErrorCodes.notFound));

    expect(await codeOf(service.vote(viewer as never, 'change-1', { version: 3, decision: 'APPROVED' } as never))).toBe(
      changeErrorCodes.notFound,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
