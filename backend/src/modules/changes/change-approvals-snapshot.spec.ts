jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));
jest.mock('./change-downtime-outbox', () => ({ enqueueChangeDowntimeSync: jest.fn(async () => undefined) }));

import { ChangeApprovalsService } from './change-approvals.service';
import { changeErrorCodes, changeLimits } from './changes.constants';
import { cabVotersMax } from './load-cab-voters';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'u1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };

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

function buildService() {
  const prisma = {
    changeEvent: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
    },
    user: { findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []) },
    changeApproval: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<unknown[]> => []),
      // W7.76: `commentsRedacted` is a SQL count, not a scan of one page.
      count: jest.fn(async (): Promise<number> => 0),
    },
    $transaction: jest.fn(async (_work: (tx: unknown) => unknown): Promise<unknown> => undefined),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    configuration: jest.fn(async () => configuration()),
    isCabMember: jest.fn(async () => true),
  };
  const changes = {
    loadInScope: jest.fn(async () => changeRow()),
    get: jest.fn(async () => ({ id: 'change-1' })),
    detailLevelFor: jest.fn(async () => 'full'),
  };
  const outbox = { enqueue: jest.fn(async () => undefined) };
  const service = new ChangeApprovalsService(prisma as never, access as never, changes as never, outbox as never);
  return { prisma, access, changes, service };
}

describe('CAB round snapshot (BA-changes-06)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves the voter set from the event that opened the round', async () => {
    const { prisma, service } = buildService();
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      { detail: { from: 'ASSESSMENT', to: 'AUTHORIZATION', round: 2, voterSnapshot: { round: 2, voters: ['u1', 'u2'], quorum: 2 } } },
    ]);

    const result = await service.voterSnapshot(changeRow() as never, configuration());

    expect(result).toEqual({ snapshot: { round: 2, voters: ['u1', 'u2'], quorum: 2 }, frozen: true });
    const args = prisma.changeEvent.findMany.mock.calls[0]?.[0] as QueryArgs;
    expect(args.where).toEqual({ changeId: 'change-1', action: 'status' });
    expect(args.take).toBeGreaterThan(0);
  });

  it('ignores a snapshot of another round and falls back to the live CAB', async () => {
    const { prisma, service } = buildService();
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      { detail: { to: 'AUTHORIZATION', voterSnapshot: { round: 1, voters: ['old-1'], quorum: 1 } } },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }, { id: 'requester' }]);

    const result = await service.voterSnapshot(changeRow() as never, configuration());

    // Live list minus the requester; quorum = min(setting 2, eligible 2).
    expect(result).toEqual({ snapshot: { round: 2, voters: ['u1', 'u2'], quorum: 2 }, frozen: false });
  });

  it('freezes every eligible voter past the old hundred cap (W7.70)', async () => {
    const { prisma, service } = buildService();
    // A CAB with 150 approvers: the round used to freeze the first 100, so its
    // quorum was min(setting, 100) and 50 members could never vote.
    const roster = Array.from({ length: 150 }, (_, index) => `u${String(index + 1).padStart(3, '0')}`);
    prisma.user.findMany.mockImplementation(async (args: QueryArgs): Promise<unknown[]> => {
      const after = (args.where as { id?: { gt?: string } }).id?.gt;
      const remaining = after === undefined ? roster : roster.filter((id) => id > after);
      return remaining.slice(0, args.take as number).map((id) => ({ id }));
    });

    const result = await service.voterSnapshot(changeRow() as never, {
      ...configuration(),
      normalQuorum: 150,
    });

    expect(result.frozen).toBe(false);
    expect(result.snapshot.voters).toEqual(roster);
    // Quorum follows the whole eligible set now: min(150, 150).
    expect(result.snapshot.quorum).toBe(150);
  });

  it('stops a round whose CAB group is above the voter ceiling (W7.70)', async () => {
    const { prisma, service } = buildService();
    const roster = Array.from({ length: cabVotersMax + 1 }, (_, index) => `u${String(index + 1).padStart(4, '0')}`);
    prisma.user.findMany.mockImplementation(async (args: QueryArgs): Promise<unknown[]> => {
      const after = (args.where as { id?: { gt?: string } }).id?.gt;
      const remaining = after === undefined ? roster : roster.filter((id) => id > after);
      return remaining.slice(0, args.take as number).map((id) => ({ id }));
    });

    await expect(service.voterSnapshot(changeRow() as never, configuration())).rejects.toMatchObject({
      code: changeErrorCodes.cabGroupTooLarge,
    });
    expect(changeLimits.cabVotersMax).toBe(cabVotersMax);
  });

  it('refuses a vote from someone who is not in the frozen round', async () => {
    const { prisma, service } = buildService();
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      { detail: { to: 'AUTHORIZATION', voterSnapshot: { round: 2, voters: ['u2', 'u3'], quorum: 2 } } },
    ]);

    await expect(
      service.vote(viewer, 'change-1', { version: 3, decision: 'APPROVED' } as never),
    ).rejects.toMatchObject({ code: changeErrorCodes.notApprover });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approves with the frozen quorum even after the CAB has grown', async () => {
    const { prisma, service } = buildService();
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      { detail: { to: 'AUTHORIZATION', voterSnapshot: { round: 2, voters: ['u1', 'u2'], quorum: 2 } } },
    ]);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    prisma.$transaction.mockImplementationOnce(async (work: (tx: unknown) => unknown) =>
      work({
        changeApproval: {
          create: jest.fn(async () => undefined),
          findMany: jest.fn(async () => [
            { approverUserId: 'u1', decision: 'APPROVED' },
            { approverUserId: 'u2', decision: 'APPROVED' },
            // A vote from outside the frozen set must not decide anything.
            { approverUserId: 'outsider', decision: 'REJECTED' },
          ]),
        },
        changeRequest: { updateMany },
        changeEvent: { create: jest.fn(async () => undefined) },
      }),
    );

    await service.vote(viewer, 'change-1', { version: 3, decision: 'APPROVED' } as never);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
  });

  it('reports the frozen set in the overview and hides the vote button outside it', async () => {
    const { prisma, access, service } = buildService();
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      { detail: { to: 'AUTHORIZATION', voterSnapshot: { round: 2, voters: ['u2', 'u3'], quorum: 2 } } },
    ]);
    prisma.changeApproval.findMany.mockResolvedValueOnce([
      { id: 'vote-1', round: 2, decision: 'APPROVED', comment: null, decidedAt: new Date(), approverUserId: 'u2', approver: { id: 'u2', displayName: 'Drugi', email: 'u2@example.test' } },
      { id: 'vote-2', round: 2, decision: 'REJECTED', comment: 'ne', decidedAt: new Date(), approverUserId: 'outsider', approver: { id: 'outsider', displayName: 'Tuđi', email: 'x@example.test' } },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'u2', displayName: 'Drugi', email: 'u2@example.test' },
      { id: 'u3', displayName: 'Treći', email: 'u3@example.test' },
    ]);

    const overview = await service.overview(viewer, 'change-1');

    expect(overview.frozen).toBe(true);
    expect(overview.quorum).toBe(2);
    expect(overview.approvals).toBe(1);
    expect(overview.voters.map((voter) => voter.id)).toEqual(['u2', 'u3']);
    expect(overview.canVote).toBe(false);
    expect(access.isCabMember).toHaveBeenCalled();
  });
});
