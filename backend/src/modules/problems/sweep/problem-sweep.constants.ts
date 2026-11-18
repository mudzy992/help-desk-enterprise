/** Paket 3.3 (P5): hourly sweep for problem targets (§10) and auto-close (§5). */
export const problemSweepQueueName = 'problem-sweep';
export const problemSweepJobName = 'problem-sweep-run';
export const problemSweepSchedulerId = 'problem-sweep-hourly';
/**
 * Hourly; target reminders go out from 07:00 local time on working days of
 * the target calendar (like the 07:30 digest). W7.25: the durable
 * `ProblemTargetReminder` row makes every run idempotent (the legacy
 * `targetRemindersSent` marker now only mirrors a confirmed outcome).
 * Auto-close runs on every tick.
 */
export const problemSweepCronPattern = '23 * * * *';
export const problemSweepReminderStartHour = 7;
export const problemSweepJobAttempts = 2;
export const problemSweepJobBackoffMilliseconds = 60_000;
export const problemSweepBatch = 500;
/**
 * W7.40 (BA-problems-18): one tick may spend this long before it leaves the rest
 * of its batch to the next one. The cadence is hourly, so a five-minute budget
 * keeps a slow tick from overlapping the next run (and from holding the worker's
 * job slot for an hour) while leaving room for a full batch of 500 rows plus
 * reminder delivery. Nothing is lost by stopping: both phases read oldest-first,
 * so a deferred row is the first row of the next tick.
 */
export const problemSweepTickBudgetMilliseconds = 5 * 60_000;

/**
 * W7.32 (BA-problems-14): one hour of completed history stays inspectable, the
 * failed jobs keep the DLQ evidence longer (the same keep-counts as before the
 * registration moved into `registerRepeatableJob`).
 */
export const problemSweepCompletedJobsToKeep = 5;
export const problemSweepFailedJobsToKeep = 20;
/** Log prefix of the schedule: `<label>_schedule_failed`, `<label>_schedule_recovered`. */
export const problemSweepJobLabel = 'problem_sweep';
/**
 * W7.32 (BA-problems-14): how often each worker verifies that the mandatory
 * hourly schedule still exists in Redis. `upsertJobScheduler` is idempotent by
 * scheduler id, so several workers may reconcile the same schedule concurrently;
 * one probe per minute is the cost of not staying blind until the next deploy.
 */
export const problemSweepReconcileMilliseconds = 60_000;

/**
 * W7.25 (BA-problems-07): a target reminder is a durable row, so a failed attempt
 * is retried instead of being lost. The hourly sweep moves a FAILED row again
 * after 2/10/60/240 minutes; the fifth failed attempt leaves it DEAD until an
 * operator retries it (`POST /problems/:id/target-reminders/:reminderId/retry`).
 */
export const problemReminderMaxAttempts = 5;
export const problemReminderBackoffMinutes = [2, 10, 60, 240] as const;
/**
 * A claim older than this belonged to a crashed sweep. Unlike the e-mail ledger,
 * a reminder may simply be sent again: both channels carry the stable per-stage
 * dedupe key (`problem:<type>:<problemId>:<stage>:<targetAt>`), so the in-app row
 * is unique and the e-mail ledger refuses a second send of the same message.
 */
export const problemReminderClaimStaleMilliseconds = 30 * 60_000;
