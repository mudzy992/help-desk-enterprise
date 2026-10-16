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

/**
 * Kad nijedan kanal nije isporučio poruku, engine oslobodi brojač i pokušava
 * ponovo. Bez donje granice to je bio pokušaj **svake minute** (dok provajder
 * odbija slanje ili dok nema primalaca) — stotine uzaludnih e-mailova dnevno.
 * Podsjetnik (4 h) je za alarme koji su isporučeni; ovo je za one koji nisu.
 */
export const alertNotifyRetryMs = 15 * 60_000;

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
  /** Donja granica ponavljanja prve (neisporučene) poruke. */
  readonly notifyRetryMs?: number;
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
    // first message after that is still the "opened" one — but not sooner than
    // `notifyRetryMs` after the last failed attempt.
    if (open.notifyCount === 0) {
      const retryMs = input.notifyRetryMs ?? alertNotifyRetryMs;
      const retryDue =
        open.lastNotifiedAt === null ||
        now.getTime() - open.lastNotifiedAt.getTime() >= retryMs;
      return { streak, action, notify: retryDue ? 'opened' : null };
    }
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
