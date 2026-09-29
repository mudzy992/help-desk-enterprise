/**
 * Paket 2.9 (K3): on-call sweep (reminders, shift start, uncovered shifts,
 * history retention). Every 15 minutes at :01/:16/:31/:46 so it never starts
 * together with the other quarter-hourly sweeps. Same budget/DLQ policy as the
 * other worker jobs (see knowledge-base-review-reminder.job.constants.ts).
 */
export const onCallSweepQueueName = 'on-call-sweep';
export const onCallSweepJobName = 'on-call-sweep-scan';
export const onCallSweepSchedulerId = 'on-call-sweep-quarter-hourly';
export const onCallSweepSchedulePattern = '0 1,16,31,46 * * * *';
export const onCallSweepJobAttempts = 2;
export const onCallSweepJobBackoffMilliseconds = 30000;
export const onCallSweepJobTimeoutMilliseconds = 120000;
export const onCallSweepCompletedJobsToKeep = 20;
export const onCallSweepFailedJobsToKeep = 50;
export const onCallSweepJobLabel = 'on_call_sweep';
export const onCallSweepJobLogContext = 'OnCallSweepJob';
