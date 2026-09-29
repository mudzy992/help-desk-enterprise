/**
 * Paket 2.9 (K2/K2b): announcement sweep (audience notification when a
 * scheduled announcement starts, e-mail batches, Teams post, receipt
 * retention). Every 5 minutes at :02/:07/…/:57 (offset from the quarter-hourly
 * sweeps) so an e-mail run starts within minutes of publication. Same budget/DLQ policy as the
 * other worker jobs (see knowledge-base-review-reminder.job.constants.ts).
 */
export const announcementSweepQueueName = 'announcement-sweep';
export const announcementSweepJobName = 'announcement-sweep-scan';
// Id kept from K2 so the upsert replaces the old quarter-hourly pattern in Redis.
export const announcementSweepSchedulerId = 'announcement-sweep-quarter-hourly';
export const announcementSweepSchedulePattern = '0 2-59/5 * * * *';
export const announcementSweepJobAttempts = 2;
export const announcementSweepJobBackoffMilliseconds = 30000;
export const announcementSweepJobTimeoutMilliseconds = 120000;
/** E-mail/Teams time budget per run (well under the timeout and the 5-minute period). */
export const announcementDeliveryBudgetMilliseconds = 90000;
export const announcementSweepCompletedJobsToKeep = 20;
export const announcementSweepFailedJobsToKeep = 50;
export const announcementSweepJobLabel = 'announcement_sweep';
export const announcementSweepJobLogContext = 'AnnouncementSweepJob';
