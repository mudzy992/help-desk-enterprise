/**
 * Paket 1.8 (A4): scheduled directory sync tick. Every 15 minutes in a free
 * slot (:07 — archive :00, unrouted :02, waiting-for-user :05, KB :10); the
 * configured cron (`private.auth.adRead.scheduleCron`) decides whether a run
 * is due, so changing the schedule needs no worker restart.
 */
export const directorySyncQueueName = 'directory-sync';
export const directorySyncJobName = 'directory-sync-tick';
export const directorySyncSchedulerId = 'directory-sync-quarter-hourly';
export const directorySyncSchedulePattern = '0 7,22,37,52 * * * *';
export const directorySyncJobAttempts = 1;
export const directorySyncJobBackoffMilliseconds = 60000;
export const directorySyncJobTimeoutMilliseconds = 1_800_000;
export const directorySyncCompletedJobsToKeep = 20;
export const directorySyncFailedJobsToKeep = 50;
export const directorySyncJobLabel = 'directory_sync';
export const directorySyncJobLogContext = 'DirectorySyncJob';
