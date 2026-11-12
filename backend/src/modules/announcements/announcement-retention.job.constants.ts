/**
 * BA-announcements-17: receipt/satellite retention runs as its own repeatable
 * worker job (hourly, offset from the sweep) instead of riding along inside
 * the 5-minute sweep, where its failures were swallowed. Job failures now
 * fail the job so BullMQ retries them (3 attempts, exponential-ish fixed
 * backoff) and the processor logs a failed metric line.
 */
export const announcementRetentionQueueName = 'announcement-retention';
export const announcementRetentionJobName = 'announcement-retention-run';
export const announcementRetentionSchedulerId = 'announcement-retention-hourly';
export const announcementRetentionSchedulePattern = '0 17 * * * *';
export const announcementRetentionJobAttempts = 3;
export const announcementRetentionJobBackoffMilliseconds = 60_000;
export const announcementRetentionJobTimeoutMilliseconds = 300_000;
export const announcementRetentionCompletedJobsToKeep = 10;
export const announcementRetentionFailedJobsToKeep = 20;
export const announcementRetentionJobLabel = 'announcement_retention';
export const announcementRetentionJobLogContext = 'AnnouncementRetentionJob';
