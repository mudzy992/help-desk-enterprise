import { localParts, zonedInstant } from '../notifications/preferences/notification-schedule-time';
import type { OnCallSegment } from './resolve-on-call';

/**
 * Paket 2.9 (K3, §4.5): what one quarter-hourly sweep has to send for one
 * schedule. Pure; the dedupe keys make a repeated or overlapping run a no-op.
 *
 * - reminder: from `reminderMinute` (schedule zone) for one hour, every shift
 *   that starts on the next local day;
 * - shiftStarted: shifts that began in the last `startGraceMs`;
 * - gap: uncovered time in the next 24 h, once per uncovered segment, to the
 *   schedule owner.
 */
export type OnCallSweepAction =
  | { readonly kind: 'reminder'; readonly userId: string; readonly segment: OnCallSegment; readonly dedupeKey: string }
  | { readonly kind: 'shiftStarted'; readonly userId: string; readonly segment: OnCallSegment; readonly dedupeKey: string }
  | { readonly kind: 'gap'; readonly userId: string; readonly segment: OnCallSegment; readonly dedupeKey: string };

export const onCallSweepWindows = {
  lookBehindMs: 2 * 86_400_000,
  lookAheadMs: 3 * 86_400_000,
  reminderWindowMinutes: 60,
  startGraceMs: 30 * 60_000,
  gapHorizonMs: 86_400_000,
} as const;

export function planOnCallSweep(input: {
  readonly scheduleId: string;
  readonly timezone: string;
  readonly ownerUserId: string | null;
  readonly segments: readonly OnCallSegment[];
  readonly now: Date;
  readonly reminderMinute: number;
}): OnCallSweepAction[] {
  const { now, timezone, scheduleId } = input;
  const actions: OnCallSweepAction[] = [];
  const nowMs = now.getTime();
  const local = localParts(now, timezone);
  const inReminderWindow =
    local.minuteOfDay >= input.reminderMinute &&
    local.minuteOfDay < input.reminderMinute + onCallSweepWindows.reminderWindowMinutes;
  // Next local day, DST-safe: midnight of today + 1 and + 2 in the schedule zone.
  const tomorrowStart = zonedInstant(timezone, local.year, local.month, local.day + 1, 0);
  const dayAfterStart = zonedInstant(timezone, local.year, local.month, local.day + 2, 0);

  input.segments.forEach((segment, index) => {
    const startMs = segment.startsAt.getTime();
    const previous = index > 0 ? input.segments[index - 1] : undefined;
    // A real start: the person differs from the one right before (a clipped
    // first segment is not a start).
    const isStart = previous !== undefined && previous.endsAt.getTime() === startMs && previous.userId !== segment.userId;
    const key = `${scheduleId}:${startMs}`;
    if (segment.userId !== null) {
      if (inReminderWindow && startMs >= tomorrowStart.getTime() && startMs < dayAfterStart.getTime() && (isStart || previous === undefined)) {
        actions.push({ kind: 'reminder', userId: segment.userId, segment, dedupeKey: `reminder:${key}:${segment.userId}` });
      }
      if (isStart && startMs <= nowMs && startMs > nowMs - onCallSweepWindows.startGraceMs) {
        actions.push({ kind: 'shiftStarted', userId: segment.userId, segment, dedupeKey: `start:${key}:${segment.userId}` });
      }
    } else if (
      input.ownerUserId !== null &&
      segment.endsAt.getTime() > nowMs &&
      startMs < nowMs + onCallSweepWindows.gapHorizonMs
    ) {
      actions.push({ kind: 'gap', userId: input.ownerUserId, segment, dedupeKey: `gap:${key}` });
    }
  });
  return actions;
}
