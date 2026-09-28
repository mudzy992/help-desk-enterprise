import { requestDeadlines } from './privacy.constants';

const dayMs = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}

/** ZZLP čl. 14(3): the answer is due 30 days after the request was received. */
export function computeDueAt(receivedAt: Date): Date {
  return addDays(receivedAt, requestDeadlines.answerDays);
}

/**
 * The deadline may be extended once, by 60 days, and the subject must be told
 * within the first 30 days — so an extension after the original due date is
 * refused.
 */
export function computeExtendedDueAt(input: {
  readonly dueAt: Date;
  readonly extendedDueAt: Date | null;
  readonly now: Date;
}): Date | null {
  if (input.extendedDueAt !== null) return null;
  if (input.now.getTime() > input.dueAt.getTime()) return null;
  return addDays(input.dueAt, requestDeadlines.extensionDays);
}

export function effectiveDueAt(request: { readonly dueAt: Date; readonly extendedDueAt: Date | null }): Date {
  return request.extendedDueAt ?? request.dueAt;
}

/** Whole days left until the effective due date (negative = overdue). */
export function daysLeft(dueAt: Date, now: Date): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / dayMs);
}

/**
 * Reminder ladder (e.g. [7, 1]): returns the rung to send now, or null. A rung
 * is sent once; when several are due (job was down) only the closest one is sent.
 */
export function dueReminderRung(input: {
  readonly dueAt: Date;
  readonly now: Date;
  readonly ladder: readonly number[];
  readonly sent: readonly number[];
}): number | null {
  const left = daysLeft(input.dueAt, input.now);
  const candidates = input.ladder.filter((rung) => left <= rung && !input.sent.includes(rung));
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}
