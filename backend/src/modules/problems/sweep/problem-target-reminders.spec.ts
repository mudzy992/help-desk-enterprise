import {
  appendReminderStage,
  decideProblemReminderOutcome,
  dueReminderWhere,
  isReminderTerminal,
  readReminderStages,
  reminderBackoffMilliseconds,
} from './problem-target-reminders';
import { problemReminderMaxAttempts } from './problem-sweep.constants';

/**
 * W7.25 (BA-problems-07): the state machine is the fix. Under the old code the
 * marker was written *before* the attempt, so "nothing sent" and "sent" were
 * indistinguishable; here only a confirmed outcome is terminal and appends it.
 */
describe('problem target reminder state machine', () => {
  const now = new Date('2027-11-30T07:23:00.000Z');

  it('a delivery is final and appends the marker', () => {
    const decision = decideProblemReminderOutcome({
      outcome: { delivered: 2, recipients: 3, failures: 1, errorCode: 'EMAIL_FAILED' },
      attempts: 1,
      now,
    });
    expect(decision).toEqual({ status: 'SENT', appendsMarker: true, nextAttemptAt: null, errorCode: null });
  });

  it('nobody to notify is a final policy outcome that appends the marker', () => {
    const decision = decideProblemReminderOutcome({
      outcome: { delivered: 0, recipients: 0, failures: 0, errorCode: null },
      attempts: 1,
      now,
    });
    expect(decision).toEqual({ status: 'NO_RECIPIENT', appendsMarker: true, nextAttemptAt: null, errorCode: null });
  });

  it.each([
    [1, 2],
    [2, 10],
    [3, 60],
    [4, 240],
    [5, 240],
  ])('failure %i waits %i minutes and never appends the marker', (attempts, minutes) => {
    expect(reminderBackoffMilliseconds(attempts)).toBe(minutes * 60_000);
    const decision = decideProblemReminderOutcome({
      outcome: { delivered: 0, recipients: 1, failures: 1, errorCode: 'IN_APP_FAILED' },
      attempts,
      now,
    });
    if (attempts >= problemReminderMaxAttempts) {
      expect(decision).toEqual({ status: 'DEAD', appendsMarker: false, nextAttemptAt: null, errorCode: 'IN_APP_FAILED' });
    } else {
      expect(decision.status).toBe('FAILED');
      expect(decision.appendsMarker).toBe(false);
      expect(decision.errorCode).toBe('IN_APP_FAILED');
      expect(decision.nextAttemptAt?.getTime()).toBe(now.getTime() + minutes * 60_000);
    }
  });

  it('the fifth failure is dead-lettered instead of retried forever', () => {
    const decision = decideProblemReminderOutcome({
      outcome: { delivered: 0, recipients: 1, failures: 1, errorCode: 'EMAIL_DEAD' },
      attempts: problemReminderMaxAttempts,
      now,
    });
    expect(decision.status).toBe('DEAD');
    expect(decision.nextAttemptAt).toBeNull();
    expect(decision.appendsMarker).toBe(false);
  });

  it('an allowed channel that confirmed nothing stays retryable and never marks the stage as sent', () => {
    const decision = decideProblemReminderOutcome({
      outcome: { delivered: 0, recipients: 2, failures: 0, errorCode: null },
      attempts: 1,
      now,
    });
    expect(decision.status).toBe('FAILED');
    expect(decision.errorCode).toBe('NOTHING_DELIVERED');
    expect(decision.appendsMarker).toBe(false);
  });

  it('claims PENDING, due FAILED and stale CLAIMED rows only', () => {
    const where = dueReminderWhere(now);
    const branches = (where.OR ?? []) as Record<string, unknown>[];
    expect(branches).toEqual([
      { status: 'PENDING' },
      { status: 'FAILED', nextAttemptAt: { lte: now } },
      { status: 'FAILED', nextAttemptAt: null },
      { status: 'CLAIMED', claimedAt: { lt: new Date(now.getTime() - 30 * 60_000) } },
    ]);
  });

  it('terminal states are not picked up again', () => {
    expect(['SENT', 'NO_RECIPIENT', 'DEAD', 'CANCELLED'].every(isReminderTerminal)).toBe(true);
    expect(['PENDING', 'CLAIMED', 'FAILED'].some(isReminderTerminal)).toBe(false);
  });

  it('the legacy marker is appended, never rewritten or duplicated', () => {
    expect(appendReminderStage([], 'due')).toEqual(['due']);
    expect(appendReminderStage(['before'], 'due')).toEqual(['before', 'due']);
    expect(appendReminderStage(['before', 'due'], 'due')).toEqual(['before', 'due']);
    expect(appendReminderStage(null, 'overdue')).toEqual(['overdue']);
    expect(readReminderStages({ nope: true })).toEqual([]);
    expect(readReminderStages(['due', 7, null])).toEqual(['due']);
  });
});
