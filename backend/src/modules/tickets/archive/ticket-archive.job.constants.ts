/**
 * Phase 4.1 (plan §4.1): the schedule of one periodic job, in one place.
 *
 * Before this phase the job ran as an `@Interval`/`setInterval` inside the API
 * process; it now runs in the worker as a BullMQ scheduled job. The cadence is
 * unchanged (every 15 minutes) — only the phase inside the window is staggered
 * (u :00 — prvi u prozoru), so no two sweeps ever start at the same moment.
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
export const ticketArchiveQueueName = 'ticket-archive';
export const ticketArchiveJobName = 'ticket-archive-scan';
export const ticketArchiveSchedulerId = 'ticket-archive-quarter-hourly';
export const ticketArchiveSchedulePattern = '0 0,15,30,45 * * * *';
export const ticketArchiveJobAttempts = 2;
export const ticketArchiveJobBackoffMilliseconds = 30000;
export const ticketArchiveJobTimeoutMilliseconds = 300000;
export const ticketArchiveCompletedJobsToKeep = 20;
export const ticketArchiveFailedJobsToKeep = 50;
export const ticketArchiveJobLabel = 'ticket_archive';
export const ticketArchiveJobLogContext = 'TicketArchiveJob';
export const ticketArchiveScheduleWindowSource = '0 0,15,30,45 * * * *';
