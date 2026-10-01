/** Paket 3.3 (P5): hourly sweep for problem targets (§10) and auto-close (§5). */
export const problemSweepQueueName = 'problem-sweep';
export const problemSweepJobName = 'problem-sweep-run';
export const problemSweepSchedulerId = 'problem-sweep-hourly';
/**
 * Hourly; target reminders go out from 07:00 local time on working days of
 * the target calendar (like the 07:30 digest), and `targetRemindersSent`
 * makes every run idempotent. Auto-close runs on every tick.
 */
export const problemSweepCronPattern = '23 * * * *';
export const problemSweepReminderStartHour = 7;
export const problemSweepJobAttempts = 2;
export const problemSweepJobBackoffMilliseconds = 60_000;
export const problemSweepBatch = 500;
