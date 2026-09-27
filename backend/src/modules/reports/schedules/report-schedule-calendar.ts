import { localParts, zonedInstant } from '../../notifications/preferences/notification-schedule-time';
import {
  addCivilDays,
  addCivilMonths,
  civilDayOf,
  isoWeekday,
  startOfCivilDayInstant,
  type CivilDay,
} from '../trends/civil-calendar';
import type { ReportScheduleFrequency } from './report-schedule.constants';

export const reportScheduleSendTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseSendTimeMinute(value: string): number | null {
  const match = reportScheduleSendTimePattern.exec(value);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Paket 2.5 (§5.1): the first send slot strictly after `after` — Monday
 * (weekly) or the 1st (monthly) at `sendTime` in the report time zone. The
 * slot is built from the civil date, so DST moves the UTC instant, never the
 * local hour.
 */
export function nextReportRunAt(
  frequency: ReportScheduleFrequency,
  sendTime: string,
  timeZone: string,
  after: Date,
): Date {
  const minute = parseSendTimeMinute(sendTime) ?? 7 * 60;
  const today = civilDayOf(after, timeZone);
  let candidate = frequency === 'WEEKLY' ? mondayOf(today) : firstOf(today);
  for (let guard = 0; guard < 4; guard += 1) {
    const slot = zonedInstant(timeZone, candidate.year, candidate.month, candidate.day, minute);
    if (slot.getTime() > after.getTime()) {
      return slot;
    }
    candidate = frequency === 'WEEKLY' ? addCivilDays(candidate, 7) : addCivilMonths(candidate, 1);
  }
  /* istanbul ignore next — unreachable: the next week/month is always later. */
  throw new Error('next report slot not found');
}

export type ReportPeriod = {
  readonly start: Date;
  /** Exclusive. */
  readonly end: Date;
  /** First civil day of the period (`YYYY-MM-DD` parts). */
  readonly firstDay: CivilDay;
  /** Last civil day of the period (inclusive). */
  readonly lastDay: CivilDay;
};

/**
 * The previous complete period seen from `at` (§5.1): last week Mon–Sun or
 * last calendar month, in the report time zone.
 */
export function previousReportPeriod(
  frequency: ReportScheduleFrequency,
  timeZone: string,
  at: Date,
): ReportPeriod {
  const today = civilDayOf(at, timeZone);
  const currentStart = frequency === 'WEEKLY' ? mondayOf(today) : firstOf(today);
  const firstDay = frequency === 'WEEKLY' ? addCivilDays(currentStart, -7) : addCivilMonths(currentStart, -1);
  return {
    start: startOfCivilDayInstant(firstDay, timeZone),
    end: startOfCivilDayInstant(currentStart, timeZone),
    firstDay,
    lastDay: addCivilDays(currentStart, -1),
  };
}

/** The first day of the `count` periods ending with `period` (trend section). */
export function trendFirstDay(
  frequency: ReportScheduleFrequency,
  period: ReportPeriod,
  count: number,
): CivilDay {
  return frequency === 'WEEKLY'
    ? addCivilDays(period.firstDay, -7 * (count - 1))
    : addCivilMonths(period.firstDay, -(count - 1));
}

/** Local minute of day of an instant (for tests and the UI preview). */
export function localMinuteOfDay(instant: Date, timeZone: string): number {
  return localParts(instant, timeZone).minuteOfDay;
}

function mondayOf(day: CivilDay): CivilDay {
  return addCivilDays(day, 1 - isoWeekday(day));
}

function firstOf(day: CivilDay): CivilDay {
  return { year: day.year, month: day.month, day: 1 };
}
