/**
 * Phase 4.1 (plan §4.1): the schedule of one periodic job, in one place.
 *
 * Before this phase the job ran as an `@Interval`/`setInterval` inside the API
 * process; it now runs in the worker as a BullMQ scheduled job. The cadence is
 * unchanged (every 15 minutes) — only the phase inside the window is staggered
 * (u :10 — treći u prozoru), so no two sweeps ever start at the same moment.
 *
 * Per-job budget and DLQ policy:
 * - timeout 120 s — enforced as `lockDuration` on the processor.
 *   BullMQ v5 has no per-job `opts.timeout` (that option only exists in the Pro
 *   edition), so the framework-native bound is used: a job that overruns loses its
 *   lock, is marked stalled and gets retried instead of blocking the worker.
 * - 2 attempts, exponential backoff starting at 30 s.
 * - the last 20 completed and 50 failed jobs stay inspectable
 *   (failed ones are the queue's dead-letter view), then expire.
 */
export const knowledgeBaseReviewReminderQueueName = 'knowledge-base-review-reminder';
export const knowledgeBaseReviewReminderJobName = 'knowledge-base-review-reminder-scan';
export const knowledgeBaseReviewReminderSchedulerId = 'kb-review-reminder-quarter-hourly';
export const knowledgeBaseReviewReminderSchedulePattern = '0 10,25,40,55 * * * *';
export const knowledgeBaseReviewReminderJobAttempts = 2;
export const knowledgeBaseReviewReminderJobBackoffMilliseconds = 30000;
export const knowledgeBaseReviewReminderJobTimeoutMilliseconds = 120000;
export const knowledgeBaseReviewReminderCompletedJobsToKeep = 20;
export const knowledgeBaseReviewReminderFailedJobsToKeep = 50;
export const knowledgeBaseReviewReminderJobLabel = 'kb_review_reminder';
export const knowledgeBaseReviewReminderJobLogContext = 'KnowledgeBaseReviewReminderJob';
export const knowledgeBaseReviewReminderScheduleWindowSource = '0 10,25,40,55 * * * *';
