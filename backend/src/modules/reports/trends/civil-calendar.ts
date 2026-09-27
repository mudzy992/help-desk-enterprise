import {
  localParts,
  zonedInstant,
} from '../../notifications/preferences/notification-schedule-time';

/** A calendar date in the report time zone; `month` is 1–12. */
export type CivilDay = { readonly year: number; readonly month: number; readonly day: number };

export function civilDayOf(instant: Date, timeZone: string): CivilDay {
  const parts = localParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** 00:00 of the civil day in the zone (DST-safe). */
export function startOfCivilDayInstant(day: CivilDay, timeZone: string): Date {
  return zonedInstant(timeZone, day.year, day.month, day.day, 0);
}

export function addCivilDays(day: CivilDay, days: number): CivilDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function addCivilMonths(day: CivilDay, months: number): CivilDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1 + months, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: 1 };
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: CivilDay): number {
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function civilDayKey(day: CivilDay): string {
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

export function compareCivilDays(left: CivilDay, right: CivilDay): number {
  return civilDayKey(left).localeCompare(civilDayKey(right));
}
