/** Paket 3.4 (§14): start reminders and overrun warnings, every 15 minutes. */
export const changeSweepQueueName = 'change-sweep';
export const changeSweepJobName = 'change-sweep-run';
export const changeSweepSchedulerId = 'change-sweep-quarter-hourly';
export const changeSweepCronPattern = '*/15 * * * *';
export const changeSweepJobAttempts = 2;
export const changeSweepJobBackoffMilliseconds = 60_000;
export const changeSweepBatch = 200;

/**
 * W7.69 (BA-changes-13): the same keep-counts the boot-time registration used,
 * moved into the shared `registerRepeatableJob` helper so every periodic job is
 * registered the same way.
 */
export const changeSweepCompletedJobsToKeep = 5;
export const changeSweepFailedJobsToKeep = 20;
/** Log prefix of the schedule: `<label>_schedule_failed`, `<label>_schedule_recovered`. */
export const changeSweepJobLabel = 'change_sweep';
/**
 * W7.69 (BA-changes-13): the sweep used to be registered once, on module init,
 * so a Redis flush or a failover to an empty instance deleted the schedule and
 * nothing put it back until the next deploy — reminders and overrun warnings
 * stopped silently. Every worker now verifies the schedule once a minute and
 * restores it; `upsertJobScheduler` is idempotent by scheduler id, so N workers
 * converge on exactly one schedule.
 */
export const changeSweepReconcileMilliseconds = 60_000;
/**
 * One complete quarter-hour window plus the generic cron grace. A last success
 * older than this means the sweep stopped producing reminders, even if the
 * registration itself is still in Redis.
 */
export const changeSweepLastSuccessMaxAgeMs = 30 * 60_000;
