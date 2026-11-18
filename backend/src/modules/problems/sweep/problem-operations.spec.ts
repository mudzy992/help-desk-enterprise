import {
  autoCloseDueWhere,
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

describe('autoCloseDueWhere (BA-problems-18)', () => {
  it('marks exactly the problems whose auto-close deadline passed', () => {
    expect(autoCloseDueWhere(now, 14)).toEqual({
      status: 'RESOLVED',
      resolvedAt: { lte: new Date(now.getTime() - 14 * 86_400_000) },
    });
  });

  it('treats 0 days as "never" so no resolved problem is counted as due', () => {
    expect(autoCloseDueWhere(now, 0)).toBeNull();
    expect(autoCloseDueWhere(now, -1)).toBeNull();
  });

  it('uses the same definition as the sweep, so the count and the work agree', () => {
    // Both read RESOLVED rows older than the deadline; the sweep closes them and
    // the health probe counts what it did not reach.
    const where = autoCloseDueWhere(now, 1) as unknown as Where;
    expect(where.status).toBe('RESOLVED');
    expect((where.resolvedAt as { lte: Date }).lte).toEqual(new Date(now.getTime() - 86_400_000));
  });
});
