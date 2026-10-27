import { SlaError } from './sla.error';
import { toMinutes } from './parse-weekly-hours';
import {
  civilMinutesOfDay,
  fromCivilMinutes,
  getZonedCivilTime,
  isoWeekdayFromCivilDate,
  startOfNextCivilDay,
  toDateKey,
  type BusinessMinutesCalendar,
} from './business-hours-civil-time';
import type { IsoWeekdayKey } from './sla.constants';

export function addBusinessMinutes(
  calendar: BusinessMinutesCalendar,
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
    if (holidays.has(toDateKey(local))) {
      cursor = startOfNextCivilDay(local, calendar.timezone);
      continue;
    }
    const weekday = isoWeekdayFromCivilDate(local) as IsoWeekdayKey;
    const intervals = [...(calendar.weeklyHours[weekday] ?? [])].sort((left, right) =>
      left.start.localeCompare(right.start),
    );
    const currentMinutes = civilMinutesOfDay(local);
    const open = intervals.find((interval) => toMinutes(interval.end) > currentMinutes);
    if (open === undefined) {
      cursor = startOfNextCivilDay(local, calendar.timezone);
      continue;
    }
    const intervalStart = toMinutes(open.start);
    if (currentMinutes < intervalStart) {
      cursor = fromCivilMinutes(local, intervalStart, calendar.timezone);
      continue;
    }
    const intervalEnd = fromCivilMinutes(
      local,
      toMinutes(open.end),
      calendar.timezone,
    );
    const available = Math.max(
      0,
      Math.floor((intervalEnd.getTime() - cursor.getTime()) / 60_000),
    );
    if (available === 0) {
      cursor = startOfNextCivilDay(local, calendar.timezone);
      continue;
    }
    const consumed = Math.min(available, remaining);
    remaining -= consumed;
    // Business minutes are elapsed real minutes while the local interval is
    // open. This skips nonexistent gap minutes and counts both fold occurrences.
    cursor = new Date(cursor.getTime() + consumed * 60_000);
  }
  if (remaining > 0) {
    throw new SlaError('CALENDAR_HAS_NO_BUSINESS_HOURS');
  }
  return cursor;
}
