import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  civilMinutesOfDay,
  fromCivilMinutes,
  getZonedCivilTime,
  isoWeekdayFromCivilDate,
  toDateKey,
  type BusinessMinutesCalendar,
} from '../sla/business-hours-civil-time';
import { loadBusinessHoursCalendar, loadBusinessHoursCalendarByKey } from '../sla/load-business-hours-calendar';
import { toMinutes } from '../sla/parse-weekly-hours';
import { startingSlaCalendarKey } from '../sla/starting-sla.constants';
import type { IsoWeekdayKey } from '../sla/sla.constants';
import type { ProblemSeverityValue, ProblemStatusValue } from './problems.constants';

/**
 * Paket 3.3 (P5, §10): optional target for problems. The target is the time
 * to the cause: it is met when the problem reaches KNOWN_ERROR (or RESOLVED
 * directly). It is counted in working days of a business-hours calendar and
 * never touches the SLA of the linked tickets.
 */

export type ProblemTargetDays = Readonly<Record<ProblemSeverityValue, number>>;

/** Statuses in which the target still runs (the cause is not known yet). */
export const problemTargetRunningStatuses: readonly ProblemStatusValue[] = ['NEW', 'INVESTIGATING'];

export function isTargetRunning(status: string): boolean {
  return (problemTargetRunningStatuses as readonly string[]).includes(status);
}

export function isTargetOverdue(problem: { status: string; targetAt: Date | null }, now: Date): boolean {
  return problem.targetAt !== null && isTargetRunning(problem.status) && problem.targetAt.getTime() < now.getTime();
}

type CivilDate = { readonly year: number; readonly month: number; readonly day: number };

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function workingIntervals(calendar: BusinessMinutesCalendar, date: CivilDate, holidays: ReadonlySet<string>) {
  if (holidays.has(toDateKey(date))) return [];
  const weekday = isoWeekdayFromCivilDate(date) as IsoWeekdayKey;
  return [...(calendar.weeklyHours[weekday] ?? [])].sort((left, right) => left.start.localeCompare(right.start));
}

/** A civil date (in the calendar time zone) is a working day. */
export function isWorkingDay(calendar: BusinessMinutesCalendar, date: CivilDate): boolean {
  return workingIntervals(calendar, date, new Set(calendar.holidays.map((holiday) => holiday.date))).length > 0;
}

/**
 * End of business on the N-th working day after the start day. The start day
 * counts as day 1 only when it is a working day and work can still start
 * before its last interval ends (a problem opened at 08:00 on Monday with
 * 1 working day is due Monday evening; one opened Saturday is due Monday).
 * Without any working day in the next year the result is null.
 */
export function addProblemWorkingDays(calendar: BusinessMinutesCalendar, start: Date, days: number): Date | null {
  if (!Number.isInteger(days) || days < 1) return null;
  const holidays = new Set(calendar.holidays.map((holiday) => holiday.date));
  const local = getZonedCivilTime(start, calendar.timezone);
  let date: CivilDate = { year: local.year, month: local.month, day: local.day };
  let remaining = days;
  const startIntervals = workingIntervals(calendar, date, holidays);
  const startEnd = startIntervals.length === 0 ? null : toMinutes(startIntervals[startIntervals.length - 1]!.end);
  if (startEnd === null || civilMinutesOfDay(local) >= startEnd) date = addCivilDays(date, 1);
  for (let step = 0; step < 400; step += 1) {
    const intervals = workingIntervals(calendar, date, holidays);
    if (intervals.length > 0) {
      remaining -= 1;
      if (remaining === 0) return fromCivilMinutes(date, toMinutes(intervals[intervals.length - 1]!.end), calendar.timezone);
    }
    date = addCivilDays(date, 1);
  }
  return null;
}

/** The working day before a civil date (for the "1 working day before" reminder). */
export function previousWorkingDayKey(calendar: BusinessMinutesCalendar, date: CivilDate): string | null {
  let cursor = addCivilDays(date, -1);
  for (let step = 0; step < 60; step += 1) {
    if (isWorkingDay(calendar, cursor)) return toDateKey(cursor);
    cursor = addCivilDays(cursor, -1);
  }
  return null;
}

export function civilDateOf(at: Date, timeZone: string): CivilDate {
  const local = getZonedCivilTime(at, timeZone);
  return { year: local.year, month: local.month, day: local.day };
}

/** Configured calendar, else the starting calendar, else the first active one. */
export async function loadProblemTargetCalendar(prisma: PrismaService, calendarId: string): Promise<BusinessMinutesCalendar | null> {
  const configured = calendarId.trim() === '' ? null : await loadBusinessHoursCalendar(prisma, calendarId.trim());
  if (configured !== null && configured.isActive) return configured;
  const starting = await loadBusinessHoursCalendarByKey(prisma, startingSlaCalendarKey);
  if (starting !== null && starting.isActive) return starting;
  const first = await prisma.businessHoursCalendar.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return first === null ? null : loadBusinessHoursCalendar(prisma, first.id);
}

/** Target for a priority, or null when targets are off or no calendar has working days. */
export async function computeProblemTarget(
  prisma: PrismaService,
  configuration: { readonly targetEnabled: boolean; readonly targetCalendarId: string; readonly targetDays: ProblemTargetDays },
  priority: ProblemSeverityValue,
  start: Date,
): Promise<Date | null> {
  if (!configuration.targetEnabled) return null;
  const calendar = await loadProblemTargetCalendar(prisma, configuration.targetCalendarId);
  if (calendar === null) return null;
  return addProblemWorkingDays(calendar, start, configuration.targetDays[priority]);
}
