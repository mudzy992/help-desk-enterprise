/**
 * W7.69 (`BA-changes-13`): the quarter-hourly sweep and the downtime outbox can
 * be perfectly healthy as *jobs* while their outcomes are not what the operator
 * assumes. These are the numbers that answer the other half: reminders that are
 * due but not marked, overruns nobody warned about, reminder deliveries that are
 * queued or abandoned, and downtime windows that do not match the plan.
 *
 * Every value here is a count or an age — no change id, title, recipient or
 * service name.
 */
export type ChangeReminderOperations = Readonly<{
  /** SCHEDULED changes starting within the next 24 h that have no reminder mark. */
  upcoming24h: number;
  /**
   * Changes the sweep should have reminded *now* (inside `reminderHoursBeforeStart`).
   * `null` means the setting could not be read — a different fact from "0 = off".
   */
  dueReminders: number | null;
  /** IMPLEMENTING changes past their planned end that nobody was warned about. */
  overdueOpen: number;
  /** Age of the oldest such change, in whole minutes. */
  oldestOverdueMinutes: number | null;
  /** The effective, already clamped setting the counts were computed with. */
  reminderHoursBeforeStart: number | null;
}>;

export type ChangeDeliveryOperations = Readonly<{
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingMinutes: number | null;
}>;

export type ChangeDowntimeOperations = Readonly<{
  /** Windows left empty by a foreign overlap in the last 24 h (plan outcome, not a fault). */
  skippedServices24h: number;
  /** Summary of the last *completed* reconciler pass; `null` when unknown/stale. */
  lastPass: { readonly completedAtMs: number; readonly scanned: number; readonly drifted: number } | null;
}>;

export type ChangeOperationsSignal = Readonly<{
  reminders: ChangeReminderOperations;
  delivery: ChangeDeliveryOperations;
  downtime: ChangeDowntimeOperations;
}>;

/** The horizon of the "upcoming, not reminded yet" counter. */
export const changeUpcomingWindowHours = 24;
/** How far back the skipped-service count looks. */
export const changeSkippedServiceWindowMs = 24 * 60 * 60_000;

/**
 * Exactly the sweep's own candidate predicate (`ChangeSweepService.run`), so the
 * metric cannot describe a different set than the job tries to drain.
 */
export function changeDueReminderWhere(now: Date, hoursBefore: number) {
  return {
    status: "SCHEDULED" as const,
    reminderSentAt: null,
    plannedStart: { gt: now, lte: new Date(now.getTime() + hoursBefore * 3_600_000) },
  };
}

/** The sweep's overrun predicate: implementing, past the planned end, not warned. */
export function changeOverdueBacklogWhere(now: Date) {
  return {
    status: "IMPLEMENTING" as const,
    overdueNotifiedAt: null,
    plannedEnd: { lt: now },
  };
}

/** Starts inside the horizon and still without a reminder mark. */
export function changeUpcomingWindowWhere(now: Date) {
  return {
    status: "SCHEDULED" as const,
    reminderSentAt: null,
    plannedStart: { gt: now, lte: new Date(now.getTime() + changeUpcomingWindowHours * 3_600_000) },
  };
}
