import type { BusinessMinutesCalendar } from '../../sla/business-hours-civil-time';
import { toDateKey } from '../../sla/business-hours-civil-time';
import { civilDateOf, isWorkingDay, previousWorkingDayKey } from '../problem-target';

export type ProblemReminderStage = 'before' | 'due' | 'overdue';

/**
 * §10: one reminder a working day before the target day, one on the target
 * day and one once overdue. Only on working days; every stage at most once.
 */
export function planProblemReminder(
  calendar: BusinessMinutesCalendar,
  problem: { readonly targetAt: Date; readonly remindersSent: readonly string[] },
  now: Date,
): ProblemReminderStage | null {
  const today = civilDateOf(now, calendar.timezone);
  if (!isWorkingDay(calendar, today)) return null;
  const todayKey = toDateKey(today);
  const targetDay = civilDateOf(problem.targetAt, calendar.timezone);
  const dueKey = toDateKey(targetDay);
  let stage: ProblemReminderStage | null = null;
  if (problem.targetAt.getTime() < now.getTime()) stage = todayKey === dueKey ? 'due' : 'overdue';
  else if (todayKey === dueKey) stage = 'due';
  else if (todayKey === previousWorkingDayKey(calendar, targetDay)) stage = 'before';
  if (stage === null || problem.remindersSent.includes(stage)) return null;
  return stage;
}
