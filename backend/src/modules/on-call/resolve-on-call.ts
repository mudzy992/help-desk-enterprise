import { localParts, zonedInstant } from '../notifications/preferences/notification-schedule-time';

/*
  Paket 2.9 (K3, §4.1): the rotation is computed, never materialized.

  Shift n (n ≥ 0) covers the civil days
    [rotationStartDate + n·L, rotationStartDate + (n+1)·L)   (L = 1 or 7 days)
  and starts/ends at `handoffMinute` local time in the schedule's zone, so a
  DST change moves the instant, not the wall-clock hand-off. Before the first
  shift nobody is on call. An override wins over the rotation.
*/

export type OnCallRotationLengthValue = 'DAY' | 'WEEK';

export type OnCallScheduleShape = {
  readonly timezone: string;
  readonly handoffMinute: number;
  readonly rotationLength: OnCallRotationLengthValue;
  readonly rotationStartDate: string;
  readonly isActive: boolean;
};

export type OnCallMemberShape = {
  readonly userId: string;
  readonly position: number;
  /** false for deactivated or anonymized users: their shift has nobody (never silently skipped). */
  readonly isAvailable: boolean;
};

export type OnCallOverrideShape = {
  readonly id: string;
  readonly userId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

export type OnCallSegment = {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** null = nobody on call (empty rotation, unavailable member, before start). */
  readonly userId: string | null;
  readonly source: 'rotation' | 'override' | 'none';
  readonly overrideId: string | null;
};

const dayMs = 86_400_000;

export function parseCivilDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

function civilDayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / dayMs);
}

function instantOfDayNumber(schedule: OnCallScheduleShape, dayNumber: number): Date {
  const date = new Date(dayNumber * dayMs);
  return zonedInstant(
    schedule.timezone,
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    schedule.handoffMinute,
  );
}

export type RotationShift = {
  readonly index: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

/** The rotation shift containing `at`, or null before the first shift. */
export function rotationShiftAt(schedule: OnCallScheduleShape, at: Date): RotationShift | null {
  const start = parseCivilDate(schedule.rotationStartDate);
  if (start === null) return null;
  const local = localParts(at, schedule.timezone);
  let dayNumber = civilDayNumber(local.year, local.month, local.day);
  if (local.minuteOfDay < schedule.handoffMinute) dayNumber -= 1;
  // A hand-off inside a skipped DST hour: localParts already moved past it, so
  // the comparison above stays correct; guard against the rare off-by-one.
  const length = schedule.rotationLength === 'WEEK' ? 7 : 1;
  const startDay = civilDayNumber(start.year, start.month, start.day);
  const offset = dayNumber - startDay;
  if (offset < 0) return null;
  const index = Math.floor(offset / length);
  const firstDay = startDay + index * length;
  let shift = {
    index,
    startsAt: instantOfDayNumber(schedule, firstDay),
    endsAt: instantOfDayNumber(schedule, firstDay + length),
  };
  if (at.getTime() < shift.startsAt.getTime()) {
    if (index === 0) return null;
    shift = {
      index: index - 1,
      startsAt: instantOfDayNumber(schedule, firstDay - length),
      endsAt: shift.startsAt,
    };
  } else if (at.getTime() >= shift.endsAt.getTime()) {
    shift = {
      index: index + 1,
      startsAt: shift.endsAt,
      endsAt: instantOfDayNumber(schedule, firstDay + 2 * length),
    };
  }
  return shift;
}

function rotationMemberFor(members: readonly OnCallMemberShape[], index: number): OnCallMemberShape | null {
  if (members.length === 0) return null;
  const ordered = [...members].sort((left, right) => left.position - right.position);
  return ordered[index % ordered.length] ?? null;
}

/** Who is on call at `at`, with the covering segment (§4.1). */
export function resolveOnCall(
  schedule: OnCallScheduleShape,
  members: readonly OnCallMemberShape[],
  overrides: readonly OnCallOverrideShape[],
  at: Date,
): OnCallSegment {
  const time = at.getTime();
  const override = overrides.find(
    (item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime(),
  );
  if (!schedule.isActive) {
    return { startsAt: at, endsAt: at, userId: null, source: 'none', overrideId: null };
  }
  if (override !== undefined) {
    return {
      startsAt: override.startsAt,
      endsAt: override.endsAt,
      userId: override.userId,
      source: 'override',
      overrideId: override.id,
    };
  }
  const shift = rotationShiftAt(schedule, at);
  if (shift === null) {
    return { startsAt: at, endsAt: at, userId: null, source: 'none', overrideId: null };
  }
  const member = rotationMemberFor(members, shift.index);
  return {
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    userId: member !== null && member.isAvailable ? member.userId : null,
    source: member !== null && member.isAvailable ? 'rotation' : 'none',
    overrideId: null,
  };
}

/**
 * Contiguous segments covering [from, to): rotation shifts cut by overrides.
 * Used for the calendar, reminders and the iCal feed.
 */
export function listOnCallSegments(
  schedule: OnCallScheduleShape,
  members: readonly OnCallMemberShape[],
  overrides: readonly OnCallOverrideShape[],
  from: Date,
  to: Date,
): OnCallSegment[] {
  if (!schedule.isActive || to.getTime() <= from.getTime()) return [];
  const boundaries = new Set<number>([from.getTime(), to.getTime()]);
  let cursor = from;
  // Rotation boundaries; bounded by the range (at most ~1 per day).
  for (let guard = 0; guard < 4000 && cursor.getTime() < to.getTime(); guard += 1) {
    const shift = rotationShiftAt(schedule, cursor);
    if (shift === null) {
      const start = parseCivilDate(schedule.rotationStartDate);
      if (start === null) break;
      const first = instantOfDayNumber(schedule, civilDayNumber(start.year, start.month, start.day));
      if (first.getTime() <= cursor.getTime()) break;
      boundaries.add(first.getTime());
      cursor = first;
      continue;
    }
    boundaries.add(shift.endsAt.getTime());
    cursor = shift.endsAt;
  }
  for (const item of overrides) {
    boundaries.add(item.startsAt.getTime());
    boundaries.add(item.endsAt.getTime());
  }
  const points = [...boundaries]
    .filter((point) => point >= from.getTime() && point <= to.getTime())
    .sort((left, right) => left - right);
  const segments: OnCallSegment[] = [];
  for (let position = 0; position < points.length - 1; position += 1) {
    const startsAt = new Date(points[position]!);
    const endsAt = new Date(points[position + 1]!);
    const resolved = resolveOnCall(schedule, members, overrides, startsAt);
    const previous = segments[segments.length - 1];
    if (
      previous !== undefined &&
      previous.userId === resolved.userId &&
      previous.source === resolved.source &&
      previous.overrideId === resolved.overrideId &&
      previous.endsAt.getTime() === startsAt.getTime() &&
      resolved.source !== 'rotation'
    ) {
      segments[segments.length - 1] = { ...previous, endsAt };
      continue;
    }
    segments.push({ startsAt, endsAt, userId: resolved.userId, source: resolved.source, overrideId: resolved.overrideId });
  }
  return segments;
}

export function overridesOverlap(
  candidate: { readonly startsAt: Date; readonly endsAt: Date },
  existing: readonly { readonly startsAt: Date; readonly endsAt: Date }[],
): boolean {
  return existing.some(
    (item) =>
      candidate.startsAt.getTime() < item.endsAt.getTime() &&
      item.startsAt.getTime() < candidate.endsAt.getTime(),
  );
}
