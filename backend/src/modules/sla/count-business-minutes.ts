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

export function countBusinessMinutes(
  calendar: BusinessMinutesCalendar,
  start: Date,
  end: Date,
): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }
  const holidays = new Set(calendar.holidays.map((holiday) => holiday.date));
  let counted = 0;
  let cursor = new Date(start.getTime());
  for (let step = 0; cursor.getTime() < end.getTime() && step < 20_000; step += 1) {
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
    const endLocal = getZonedCivilTime(end, calendar.timezone);
    const sameDay = toDateKey(local) === toDateKey(endLocal);
    const available = toMinutes(open.end) - currentMinutes;
    const untilEnd = sameDay
      ? Math.max(0, civilMinutesOfDay(endLocal) - currentMinutes)
      : available;
    const consumed = Math.min(available, untilEnd);
    if (consumed <= 0) {
      break;
    }
    counted += consumed;
    cursor = fromCivilMinutes(local, currentMinutes + consumed, calendar.timezone);
  }
  return counted;
}
