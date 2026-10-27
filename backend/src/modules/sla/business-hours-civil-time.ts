import { isoWeekdayKeys, type IsoWeekdayKey } from './sla.constants';
import type { WeeklyHours } from './sla.types';

export type ZonedCivilTime = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

export type BusinessMinutesCalendar = {
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly holidays: readonly { readonly date: string }[];
};

export function toDateKey(
  value: Pick<ZonedCivilTime, 'year' | 'month' | 'day'>,
): string {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function isoWeekdayFromCivilDate(
  value: Pick<ZonedCivilTime, 'year' | 'month' | 'day'>,
): IsoWeekdayKey {
  const utcDay = new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
  return isoWeekdayKeys[utcDay === 0 ? 6 : utcDay - 1] ?? '1';
}

export function startOfNextCivilDay(local: ZonedCivilTime, timeZone: string): Date {
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return fromZonedCivilTime(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timeZone,
  );
}

export function getZonedCivilTime(date: Date, timeZone: string): ZonedCivilTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function fromZonedCivilTime(local: ZonedCivilTime, timeZone: string): Date {
  const localEpoch = civilEpoch(local);
  const offsets = new Set<number>();
  // Offset transitions are bounded far below this window in the IANA database.
  // Sampling both sides discovers both offsets of a fold and the post-gap offset.
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = new Date(localEpoch + hours * 60 * 60 * 1000);
    offsets.add(civilEpoch(getZonedCivilTime(instant, timeZone)) - instant.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(localEpoch - offset))
    .filter((candidate) => sameCivilMinute(getZonedCivilTime(candidate, timeZone), local))
    .sort((left, right) => left.getTime() - right.getTime());
  if (candidates[0] !== undefined) {
    // Explicit fold policy: choose the earlier occurrence.
    return candidates[0];
  }
  // Explicit gap policy: advance to the first representable civil minute.
  // The cap is fail-closed and comfortably covers all IANA offset jumps.
  for (let minutes = 1; minutes <= 24 * 60; minutes += 1) {
    const shifted = new Date(localEpoch + minutes * 60_000);
    const shiftedLocal: ZonedCivilTime = {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
    const resolved = [...offsets]
      .map((offset) => new Date(shifted.getTime() - offset))
      .filter((candidate) =>
        sameCivilMinute(getZonedCivilTime(candidate, timeZone), shiftedLocal),
      )
      .sort((left, right) => left.getTime() - right.getTime())[0];
    if (resolved !== undefined) {
      return resolved;
    }
  }
  throw new RangeError(`Unable to resolve civil time in ${timeZone}`);
}

function civilEpoch(local: ZonedCivilTime): number {
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    0,
  );
}

function sameCivilMinute(left: ZonedCivilTime, right: ZonedCivilTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function civilMinutesOfDay(local: Pick<ZonedCivilTime, 'hour' | 'minute'>): number {
  return local.hour * 60 + local.minute;
}

export function fromCivilMinutes(
  local: Pick<ZonedCivilTime, 'year' | 'month' | 'day'>,
  minutes: number,
  timeZone: string,
): Date {
  return fromZonedCivilTime(
    {
      ...local,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    timeZone,
  );
}
