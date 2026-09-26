import type { NotificationPreferencePolicy } from './notification-preference-policy';
import {
  digestSlotForDay,
  isInQuietHours,
  nextDigestSlot,
  type QuietHoursWindow,
} from './notification-schedule-time';

export type DigestScheduleRow = QuietHoursWindow & {
  readonly digestMinute: number | null;
  readonly digestWorkdaysOnly: boolean;
  readonly lastDigestSentAt: Date | null;
};

export type PendingDigestSummary = {
  /** Oldest held item per reason, absent when there is none. */
  readonly oldestDigest: Date | null;
  readonly oldestQuiet: Date | null;
};

export type DigestRunPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'digest'; readonly slot: Date | null; readonly reasons: readonly ('DIGEST' | 'QUIET')[] }
  | { readonly kind: 'quiet'; readonly reasons: readonly ('QUIET')[] };

/** Window in which a quiet-hours flush waits for the digest instead (N6). */
export const quietMergeWindowMilliseconds = 15 * 60_000;

/**
 * Paket 2.2 (N5/N6): what one user gets in this worker pass. Pure — the time
 * zone, the schedule and the held-item summary are inputs.
 */
export function planDigestRun(input: {
  readonly policy: NotificationPreferencePolicy;
  readonly schedule: DigestScheduleRow | undefined;
  readonly pending: PendingDigestSummary;
  readonly now: Date;
}): DigestRunPlan {
  const { policy, schedule, pending, now } = input;
  const digestMinute = schedule?.digestMinute ?? policy.digestDefaultMinute;
  const workdaysOnly = schedule?.digestWorkdaysOnly ?? true;
  const slot = digestSlotForDay(now, policy.timeZone, digestMinute, workdaysOnly);

  let digestDue = false;
  if (pending.oldestDigest !== null) {
    if (!policy.digestEnabled || !policy.preferencesEnabled) {
      digestDue = true;
    } else if (slot !== null && now.getTime() >= slot.getTime()) {
      const last = schedule?.lastDigestSentAt ?? null;
      digestDue =
        pending.oldestDigest.getTime() < slot.getTime() &&
        (last === null || last.getTime() < slot.getTime());
    }
  }

  const stillQuiet =
    policy.quietHoursEnabled &&
    policy.preferencesEnabled &&
    schedule !== undefined &&
    isInQuietHours(schedule, now, policy.timeZone);
  const quietDue = pending.oldestQuiet !== null && !stillQuiet;

  if (digestDue) {
    return {
      kind: 'digest',
      slot,
      reasons: quietDue ? ['DIGEST', 'QUIET'] : ['DIGEST'],
    };
  }
  if (!quietDue) {
    return { kind: 'none' };
  }
  // The quiet period ends right before the digest: one e-mail, not two.
  if (pending.oldestDigest !== null && policy.digestEnabled) {
    const next = nextDigestSlot(now, policy.timeZone, digestMinute, workdaysOnly);
    if (next !== null && next.getTime() - now.getTime() <= quietMergeWindowMilliseconds) {
      return { kind: 'none' };
    }
  }
  return { kind: 'quiet', reasons: ['QUIET'] };
}
