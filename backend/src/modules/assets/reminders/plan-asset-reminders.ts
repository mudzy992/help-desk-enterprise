import { daysUntil } from '../asset-fields';

export type ReminderCandidate = {
  readonly id: string;
  readonly endsAt: Date;
  readonly remindersSent: readonly number[];
};

export type ReminderDecision = {
  readonly id: string;
  readonly daysLeft: number;
  /** The threshold that triggered this reminder (the smallest one crossed). */
  readonly threshold: number;
  readonly remindersSent: number[];
};

/**
 * §10: one reminder per crossed threshold. `thresholds` e.g. [60, 30, 7].
 * An item is due when it expires today or later, is within the largest
 * threshold, and a crossed threshold has not been recorded yet. All crossed
 * thresholds are recorded together, so an item first seen 5 days before
 * expiry gets one reminder (not three).
 */
export function planAssetReminders(
  candidates: readonly ReminderCandidate[],
  thresholds: readonly number[],
  now: Date,
): ReminderDecision[] {
  if (thresholds.length === 0) return [];
  const decisions: ReminderDecision[] = [];
  for (const candidate of candidates) {
    const daysLeft = daysUntil(candidate.endsAt, now);
    if (daysLeft < 0) continue;
    const crossed = thresholds.filter((threshold) => daysLeft <= threshold);
    const fresh = crossed.filter((threshold) => !candidate.remindersSent.includes(threshold));
    if (fresh.length === 0) continue;
    decisions.push({
      id: candidate.id,
      daysLeft,
      threshold: Math.min(...crossed),
      remindersSent: [...new Set([...candidate.remindersSent, ...crossed])].sort((a, b) => b - a),
    });
  }
  return decisions;
}

/** Local hour in an IANA time zone (falls back to UTC on a bad zone). */
export function localHour(now: Date, timeZone: string): number {
  try {
    const text = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now);
    const hour = Number(text);
    return Number.isInteger(hour) ? hour : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}
