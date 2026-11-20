import { ChangeApprovalsService } from './change-approvals.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scope = { all: true as const };

function configuration() {
  return {
    numberPrefix: 'CHG',
    normalQuorum: 1,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: 'UTC',
  };
}

/** A change in the CAB round; no CAB group keeps the roster queries out of the way. */
function changeRow(round: number) {
  return {
    id: 'change-1',
    approvalRound: round,
    cabGroupId: null,
    requesterUserId: 'user-requester',
    type: 'NORMAL' as const,
    status: 'AUTHORIZATION' as const,
    version: 4,
    cabGroup: null,
  };
}

function voteRow(id: string, round: number, decision: string, decidedAt: string) {
  return {
    id,
    round,
    decision,
    comment: null,
    decidedAt: new Date(decidedAt),
    approverUserId: `user-${id}`,
    approver: { id: `user-${id}`, displayName: `Član ${id}`, email: `${id}@example.test` },
  };
}

function buildService(input: {
  readonly current: readonly unknown[];
  readonly history: readonly unknown[];
  readonly comments?: number;
}) {
  const prisma = {
    changeEvent: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
    changeApproval: {
      findMany: jest.fn(async (args: QueryArgs): Promise<readonly unknown[]> => {
        const where = args.where as { round?: unknown };
        return where.round === 2 ? input.current : input.history;
      }),
      count: jest.fn(async (_args: QueryArgs): Promise<number> => input.comments ?? 0),
    },
    user: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
  };
  const access = {
    require: jest.fn(async () => scope),
    configuration: jest.fn(async () => configuration()),
    isCabMember: jest.fn(async () => false),
    hasPermission: jest.fn(() => true),
  };
  const changes = {
    loadInScope: jest.fn(async () => changeRow(2)),
    detailLevelFor: jest.fn(async () => 'full'),
  };
  const service = new ChangeApprovalsService(prisma as never, access as never, changes as never, {} as never);
  return { prisma, access, changes, service };
}

describe('approval page paging (BA-changes-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the current round whole and pages only earlier rounds', async () => {
    const current = [
      voteRow('a', 2, 'APPROVED', '2030-01-02T08:00:00.000Z'),
      voteRow('b', 2, 'REJECTED', '2030-01-02T09:00:00.000Z'),
    ];
    const history = Array.from({ length: 51 }, (_, index) =>
      voteRow(`h${index}`, index < 26 ? 1 : 0, 'APPROVED', `2030-01-01T0${index % 10}:00:00.000Z`),
    );
    const { prisma, service } = buildService({ current, history });

    const page = await service.overview(viewer, 'change-1');

    // The round the screen is about is never cut, so quorum and "who still has
    // to vote" cannot describe a different set than the one shown.
    expect(page.votes.map((vote) => vote.id)).toEqual(['a', 'b']);
    expect(page.votesTruncated).toBe(false);
    // Counted from the whole round, not from whichever page is on screen.
    expect(page.approvals).toBe(1);

    const historyCall = prisma.changeApproval.findMany.mock.calls.find(
      (call) => typeof (call[0] as QueryArgs).round === 'undefined' && (call[0] as QueryArgs).take === 51,
    );
    expect(historyCall?.[0]).toEqual(
      expect.objectContaining({
        take: 51,
        where: { changeId: 'change-1', round: { not: 2 } },
        orderBy: [{ round: 'desc' }, { decidedAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.history.items).toHaveLength(50);
    expect(page.history.hasMore).toBe(true);
    expect(page.history.nextCursor).toBe('h49');
  });

  it('forwards the history cursor to the database', async () => {
    const { prisma, service } = buildService({ current: [], history: [voteRow('h9', 1, 'APPROVED', '2030-01-01T00:00:00.000Z')] });

    const page = await service.overview(viewer, 'change-1', { limit: 10, cursor: 'h10' });

    expect(prisma.changeApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'h10' }, skip: 1, take: 11 }),
    );
    expect(page.history.items.map((vote) => vote.id)).toEqual(['h9']);
    expect(page.history.hasMore).toBe(false);
    expect(page.history.nextCursor).toBeNull();
  });

  it('reports a round wider than the voter ceiling instead of quietly cutting it', async () => {
    const current = Array.from({ length: 501 }, (_, index) =>
      voteRow(`c${index}`, 2, 'APPROVED', '2030-01-02T08:00:00.000Z'),
    );
    const { service } = buildService({ current, history: [] });

    const page = await service.overview(viewer, 'change-1');

    expect(page.votes).toHaveLength(500);
    expect(page.votesTruncated).toBe(true);
  });

  it('counts comments in SQL so a page boundary cannot hide a redaction notice', async () => {
    const { prisma, access, service } = buildService({ current: [], history: [], comments: 1 });
    access.hasPermission.mockReturnValue(false);
    (service as unknown as { changes: { detailLevelFor: () => Promise<string> } }).changes.detailLevelFor = jest.fn(
      async () => 'observer',
    );

    const page = await service.overview(viewer, 'change-1');

    expect(prisma.changeApproval.count).toHaveBeenCalledWith({
      where: { changeId: 'change-1', comment: { not: null } },
    });
    expect(page.commentsRedacted).toBe(true);
  });
});
