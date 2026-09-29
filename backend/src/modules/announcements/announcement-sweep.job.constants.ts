/**
 * Paket 2.9 (K2): announcement sweep (audience notification when a scheduled
 * announcement starts, receipt retention). Every 15 minutes at :03/:18/:33/:48
 * (offset from the other quarter-hourly sweeps). Same budget/DLQ policy as the
 * other worker jobs (see knowledge-base-review-reminder.job.constants.ts).
 */
export const announcementSweepQueueName = 'announcement-sweep';
export const announcementSweepJobName = 'announcement-sweep-scan';
export const announcementSweepSchedulerId = 'announcement-sweep-quarter-hourly';
export const announcementSweepSchedulePattern = '0 3,18,33,48 * * * *';
export const announcementSweepJobAttempts = 2;
export const announcementSweepJobBackoffMilliseconds = 30000;
export const announcementSweepJobTimeoutMilliseconds = 120000;
export const announcementSweepCompletedJobsToKeep = 20;
export const announcementSweepFailedJobsToKeep = 50;
export const announcementSweepJobLabel = 'announcement_sweep';
export const announcementSweepJobLogContext = 'AnnouncementSweepJob';
