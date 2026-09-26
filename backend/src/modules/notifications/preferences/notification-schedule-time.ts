/**
 * Paket 2.2: wall-clock arithmetic in the installation time zone (Intl only,
 * no dependency). Minutes are "minutes after local midnight".
 */
export type LocalParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** 0 = Sunday … 6 = Saturday */
  readonly weekday: number;
  readonly minuteOfDay: number;
};

const weekdays: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

function rawParts(date: Date, timeZone: string) {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(date)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdays[parts.weekday ?? 'Sun'] ?? 0,
  };
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = rawParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    minuteOfDay: parts.hour * 60 + parts.minute,
  };
}

function offsetMilliseconds(date: Date, timeZone: string): number {
  const parts = rawParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of local `year-month-day minute` (DST-safe; a skipped time moves forward). */
export function zonedInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const first = guess - offsetMilliseconds(new Date(guess), timeZone);
  const second = guess - offsetMilliseconds(new Date(first), timeZone);
  return new Date(second);
}

export function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export type QuietHoursWindow = {
  readonly quietHoursEnabled: boolean;
  readonly quietStartMinute: number;
  readonly quietEndMinute: number;
  readonly quietWeekends: boolean;
};

export function isInQuietHours(window: QuietHoursWindow, now: Date, timeZone: string): boolean {
  if (!window.quietHoursEnabled) return false;
  const local = localParts(now, timeZone);
  if (window.quietWeekends && isWeekend(local.weekday)) return true;
  const { quietStartMinute: start, quietEndMinute: end } = window;
  if (start === end) return false;
  const minute = local.minuteOfDay;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Today's digest slot, or null when today is skipped (weekend with workdays-only). */
export function digestSlotForDay(
  now: Date,
  timeZone: string,
  digestMinute: number,
  workdaysOnly: boolean,
): Date | null {
  const local = localParts(now, timeZone);
  if (workdaysOnly && isWeekend(local.weekday)) return null;
  return zonedInstant(timeZone, local.year, local.month, local.day, digestMinute);
}

/** Next slot strictly after `now` (for the UI "next digest" line), within 8 days. */
export function nextDigestSlot(
  now: Date,
  timeZone: string,
  digestMinute: number,
  workdaysOnly: boolean,
): Date | null {
  for (let offset = 0; offset < 8; offset += 1) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const slot = digestSlotForDay(probe, timeZone, digestMinute, workdaysOnly);
    if (slot !== null && slot.getTime() > now.getTime()) return slot;
  }
  return null;
}

export function parseClockMinute(value: string, fallback: number): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) return fallback;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute < 1440 ? minute : fallback;
}
