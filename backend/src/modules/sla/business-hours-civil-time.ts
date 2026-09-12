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
  const utcGuess = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    0,
  );
  const asTimeZone = getZonedCivilTime(new Date(utcGuess), timeZone);
  const asTimeZoneUtc = Date.UTC(
    asTimeZone.year,
    asTimeZone.month - 1,
    asTimeZone.day,
    asTimeZone.hour,
    asTimeZone.minute,
    0,
  );
  return new Date(utcGuess - (asTimeZoneUtc - utcGuess));
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
