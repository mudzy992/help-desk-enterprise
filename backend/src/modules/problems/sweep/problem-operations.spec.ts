import {
  breachedProblemTargetWhere,
  problemOpenTargetStatuses,
  stuckProblemReminderWhere,
} from './problem-operations';
import { problemReminderClaimStaleMilliseconds } from './problem-sweep.constants';

type Where = Record<string, unknown>;

const now = new Date('2026-10-29T09:00:00.000Z');

function arms(where: Where): readonly Where[] {
  return (where.OR as readonly Where[] | undefined) ?? [];
}

describe('stuckProblemReminderWhere (BA-problems-14)', () => {
  it('catches exhausted attempts, overdue retries and claims of a dead sweep', () => {
    const where = stuckProblemReminderWhere(now) as unknown as Where;
    expect(arms(where)).toEqual([
      { status: 'DEAD' },
      { status: 'FAILED', nextAttemptAt: { lte: now } },
      { status: 'FAILED', nextAttemptAt: null },
      {
        status: 'CLAIMED',
        claimedAt: { lt: new Date(now.getTime() - problemReminderClaimStaleMilliseconds) },
      },
    ]);
  });

  it('never counts a pending row or a row waiting for its backoff', () => {
    const statuses = arms(stuckProblemReminderWhere(now) as unknown as Where).map((arm) => arm.status);
    expect(statuses).not.toContain('PENDING');
    expect(statuses).not.toContain('SENT');
    expect(statuses).not.toContain('NO_RECIPIENT');
    expect(statuses).not.toContain('CANCELLED');
  });
});

describe('breachedProblemTargetWhere (BA-problems-14)', () => {
  it('counts only targets that passed on problems still being worked on', () => {
    const where = breachedProblemTargetWhere(now) as unknown as Where;
    expect(where).toEqual({
      status: { in: [...problemOpenTargetStatuses] },
      targetAt: { lt: now },
    });
    expect(problemOpenTargetStatuses).not.toContain('RESOLVED');
    expect(problemOpenTargetStatuses).not.toContain('CLOSED');
    expect(problemOpenTargetStatuses).not.toContain('CANCELLED');
  });
});
