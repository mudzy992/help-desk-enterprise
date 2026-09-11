import { isoWeekdayKeys, type IsoWeekdayKey } from './sla.constants';
import { SlaError } from './sla.error';
import { toMinutes } from './parse-weekly-hours';
import type { WeeklyHours } from './sla.types';

type ZonedCivilTime = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

type AddBusinessMinutesCalendar = {
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly holidays: readonly { readonly date: string }[];
};

export function addBusinessMinutes(
  calendar: AddBusinessMinutesCalendar,
  start: Date,
  minutes: number,
): Date {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new SlaError('INVALID_SLA_TARGETS');
  }
  const holidays = new Set(calendar.holidays.map((holiday) => holiday.date));
  let remaining = minutes;
  let cursor = new Date(start.getTime());
  for (let step = 0; remaining > 0 && step < 20_000; step += 1) {
    const local = getZonedCivilTime(cursor, calendar.timezone);
    const dateKey = toDateKey(local);
    if (holidays.has(dateKey)) {
      cursor = startOfNextCivilDay(local, calendar.timezone);
      continue;
    }
    const weekday = isoWeekdayFromCivilDate(local) as IsoWeekdayKey;
    const intervals = [...(calendar.weeklyHours[weekday] ?? [])].sort((left, right) =>
      left.start.localeCompare(right.start),
    );
    const currentMinutes = local.hour * 60 + local.minute;
    const open = intervals.find((interval) => toMinutes(interval.end) > currentMinutes);
    if (open === undefined) {
      cursor = startOfNextCivilDay(local, calendar.timezone);
      continue;
    }
    const intervalStart = toMinutes(open.start);
    if (currentMinutes < intervalStart) {
      cursor = fromZonedCivilTime(
        { ...local, hour: Math.floor(intervalStart / 60), minute: intervalStart % 60 },
        calendar.timezone,
      );
      continue;
    }
    const available = toMinutes(open.end) - currentMinutes;
    const consumed = Math.min(available, remaining);
    remaining -= consumed;
    const endMinutes = currentMinutes + consumed;
    cursor = fromZonedCivilTime(
      { ...local, hour: Math.floor(endMinutes / 60), minute: endMinutes % 60 },
      calendar.timezone,
    );
  }
  if (remaining > 0) {
    throw new SlaError('CALENDAR_HAS_NO_BUSINESS_HOURS');
  }
  return cursor;
}

function toDateKey(value: Pick<ZonedCivilTime, 'year' | 'month' | 'day'>): string {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function isoWeekdayFromCivilDate(
  value: Pick<ZonedCivilTime, 'year' | 'month' | 'day'>,
): IsoWeekdayKey {
  const utcDay = new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
  return isoWeekdayKeys[utcDay === 0 ? 6 : utcDay - 1] ?? '1';
}

function startOfNextCivilDay(local: ZonedCivilTime, timeZone: string): Date {
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

function getZonedCivilTime(date: Date, timeZone: string): ZonedCivilTime {
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

function fromZonedCivilTime(local: ZonedCivilTime, timeZone: string): Date {
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
