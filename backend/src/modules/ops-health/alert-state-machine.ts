import { opsAlertCatalog, type OpsAlertSeverity } from './ops-alert-catalog';
import type { OpsObservation } from './evaluate-ops-signals';

/**
 * Paket 2.7 (§5.1): one step of an alarm's life. Pure; the engine loads the
 * open row and the streak, applies the decision and sends the notification.
 */
export type AlertStreak = { readonly positive: number; readonly negative: number };

export type OpenAlertState = {
  readonly status: 'FIRING' | 'ACKNOWLEDGED';
  readonly severity: OpsAlertSeverity;
  readonly lastNotifiedAt: Date | null;
  readonly notifyCount: number;
};

export type AlertNotificationKind = 'opened' | 'escalated' | 'reminder' | 'resolved';

export type AlertDecision = {
  readonly streak: AlertStreak;
  readonly action: 'none' | 'open' | 'touch' | 'escalate' | 'deescalate' | 'resolve';
  readonly notify: AlertNotificationKind | null;
};

const severityRank: Readonly<Record<OpsAlertSeverity, number>> = { WARNING: 1, CRITICAL: 2 };

export function decideAlertTransition(input: {
  readonly observation: OpsObservation;
  readonly open: OpenAlertState | null;
  readonly streak: AlertStreak;
  readonly now: Date;
  readonly reminderMs: number;
}): AlertDecision {
  const { observation, open, now } = input;
  const definition = opsAlertCatalog[observation.key];
  if (observation.active) {
    const streak = { positive: input.streak.positive + 1, negative: 0 };
    if (open === null) {
      const openAfter = Math.max(1, observation.openAfter ?? definition.openAfter);
      return streak.positive >= openAfter
        ? { streak, action: 'open', notify: 'opened' }
        : { streak, action: 'none', notify: null };
    }
    const rise = severityRank[observation.severity] - severityRank[open.severity];
    if (rise > 0) return { streak, action: 'escalate', notify: 'escalated' };
    const action = rise < 0 ? 'deescalate' : 'touch';
    // Opened while notifications were silenced (or every channel failed): the
    // first message after that is still the "opened" one.
    if (open.notifyCount === 0) return { streak, action, notify: 'opened' };
    const reminderDue =
      open.status === 'FIRING' &&
      (open.lastNotifiedAt === null || now.getTime() - open.lastNotifiedAt.getTime() >= input.reminderMs);
    return { streak, action, notify: reminderDue ? 'reminder' : null };
  }
  const streak = { positive: 0, negative: input.streak.negative + 1 };
  if (open === null) return { streak, action: 'none', notify: null };
  if (streak.negative >= Math.max(1, definition.resolveAfter)) {
    // Nobody heard about an alarm that never notified, so no "resolved" either.
    return { streak, action: 'resolve', notify: open.notifyCount > 0 ? 'resolved' : null };
  }
  return { streak, action: 'none', notify: null };
}
