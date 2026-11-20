jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn(async () => undefined),
}));
jest.mock('./change-downtime-outbox', () => ({
  enqueueChangeDowntimeSync: jest.fn(async () => undefined),
}));

import { ChangeApprovalsService } from './change-approvals.service';

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    status: 'AUTHORIZATION',
    version: 3,
    type: 'NORMAL',
    approvalRound: 2,
    cabGroupId: 'cab-1',
    requesterUserId: 'requester-1',
    ownerUserId: 'owner-1',
    organizationalUnitId: 'ou-1',
    approvalRoundOpenedAt: null,
    ...overrides,
  };
}

function buildService(level: 'full' | 'participant' | 'voter' | 'observer') {
  const vote = {
    id: 'vote-1',
    round: 2,
    decision: 'REJECTED',
    comment: 'Backout plan is not specific enough',
    decidedAt: new Date('2026-01-05T00:00:00.000Z'),
    approverUserId: 'cab-voter',
    approver: {
      id: 'cab-voter',
      displayName: 'Cab Voter',
      email: 'voter@example.test',
    },
  };
  const prisma = {
    changeEvent: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    changeApproval: {
      // W7.76: the round and the earlier rounds are read separately, and the
      // "is any comment redacted" question is answered by a count.
      findMany: jest.fn(async (): Promise<unknown[]> => [vote]),
      count: jest.fn(async (): Promise<number> => 1),
    },
    user: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
  };
  const access = {
    require: jest.fn(async () => ({ all: false, paths: ['/helpdesk'] })),
    configuration: jest.fn(async () => ({
      numberPrefix: 'CHG',
      normalQuorum: 1,
      emergencyQuorum: 1,
      minLeadTimeHours: 0,
      requireTestPlan: false,
      freezePeriods: [],
      reminderHoursBeforeStart: 24,
      timeZone: 'UTC',
    })),
    isCabMember: jest.fn(async () => level === 'voter'),
  };
  const changes = {
    loadInScope: jest.fn(async () => changeRow()),
    detailLevelFor: jest.fn(async () => level),
    get: jest.fn(async () => ({ id: 'change-1' })),
  };
  const service = new ChangeApprovalsService(
    prisma as never,
    access as never,
    changes as never,
    { enqueue: jest.fn() } as never,
  );
  return { prisma, access, changes, service, vote };
}

describe('approval comment visibility (BA-changes-09)', () => {
  it('keeps comments for readers inside the change scope', async () => {
    const { service, vote } = buildService('full');

    const overview = await service.overview(
      { userId: 'manager-1' } as never,
      'change-1',
    );

    expect(overview.commentsRedacted).toBe(false);
    expect(overview.votes[0]?.comment).toBe(vote.comment);
  });

  it('keeps comments for CAB voters who deliberate on the round', async () => {
    const { service, vote } = buildService('voter');

    const overview = await service.overview(
      { userId: 'cab-voter' } as never,
      'change-1',
    );

    expect(overview.commentsRedacted).toBe(false);
    expect(overview.votes[0]?.comment).toBe(vote.comment);
  });

  it('redacts comments for the requester but keeps decisions and counts', async () => {
    const { service } = buildService('participant');

    const overview = await service.overview(
      { userId: 'requester-1' } as never,
      'change-1',
    );

    expect(overview.commentsRedacted).toBe(true);
    expect(overview.votes[0]?.comment).toBeNull();
    expect(overview.votes[0]?.decision).toBe('REJECTED');
    expect(overview.round).toBe(2);
  });

  it('redacts comments for a CAB member who may read but not vote', async () => {
    const { service } = buildService('observer');

    const overview = await service.overview(
      { userId: 'cab-reader' } as never,
      'change-1',
    );

    expect(overview.commentsRedacted).toBe(true);
    expect(overview.votes[0]?.comment).toBeNull();
    expect(overview.canVote).toBe(false);
  });

  it('always shows a voter their own comment, even outside the scope', async () => {
    const { service } = buildService('participant');

    const overview = await service.overview(
      { userId: 'cab-voter' } as never,
      'change-1',
    );

    expect(overview.commentsRedacted).toBe(true);
    expect(overview.votes[0]?.comment).toBe(
      'Backout plan is not specific enough',
    );
  });
});
