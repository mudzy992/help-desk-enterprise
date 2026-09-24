/**
 * Phase 4.1 (plan §4.1): the schedule of one periodic job, in one place.
 *
 * Before this phase the job ran as an `@Interval`/`setInterval` inside the API
 * process; it now runs in the worker as a BullMQ scheduled job. The cadence is
 * unchanged (every 15 minutes) — only the phase inside the window is staggered
 * (u :05 — drugi u prozoru), so no two sweeps ever start at the same moment.
 *
 * Per-job budget and DLQ policy:
 * - timeout 300 s — enforced as `lockDuration` on the processor.
 *   BullMQ v5 has no per-job `opts.timeout` (that option only exists in the Pro
 *   edition), so the framework-native bound is used: a job that overruns loses its
 *   lock, is marked stalled and gets retried instead of blocking the worker.
 * - 2 attempts, exponential backoff starting at 30 s.
 * - the last 20 completed and 50 failed jobs stay inspectable
 *   (failed ones are the queue's dead-letter view), then expire.
 */
export const waitingForUserQueueName = 'waiting-for-user';
export const waitingForUserJobName = 'waiting-for-user-scan';
export const waitingForUserSchedulerId = 'waiting-for-user-quarter-hourly';
export const waitingForUserSchedulePattern = '0 5,20,35,50 * * * *';
export const waitingForUserJobAttempts = 2;
export const waitingForUserJobBackoffMilliseconds = 30000;
export const waitingForUserJobTimeoutMilliseconds = 300000;
export const waitingForUserCompletedJobsToKeep = 20;
export const waitingForUserFailedJobsToKeep = 50;
export const waitingForUserJobLabel = 'waiting_for_user';
export const waitingForUserJobLogContext = 'WaitingForUserJob';
export const waitingForUserScheduleWindowSource = '0 5,20,35,50 * * * *';
