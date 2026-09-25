/**
 * Package 1.7 (U2): unrouted overdue sweep. Every 15 minutes in the free slot
 * of the window (:02 — archive :00, waiting-for-user :05, KB review :10).
 * The Monday 08:00 Europe/Sarajevo digest rides on the :02 run of that hour.
 */
export const unroutedSweepQueueName = 'unrouted-sweep';
export const unroutedSweepJobName = 'unrouted-sweep-scan';
export const unroutedSweepSchedulerId = 'unrouted-sweep-quarter-hourly';
export const unroutedSweepSchedulePattern = '0 2,17,32,47 * * * *';
export const unroutedSweepJobAttempts = 2;
export const unroutedSweepJobBackoffMilliseconds = 30000;
export const unroutedSweepJobTimeoutMilliseconds = 300000;
export const unroutedSweepCompletedJobsToKeep = 20;
export const unroutedSweepFailedJobsToKeep = 50;
export const unroutedSweepJobLabel = 'unrouted_sweep';
export const unroutedSweepJobLogContext = 'UnroutedSweepJob';
export const unroutedSweepBatchSize = 200;
export const unroutedDigestTimeZone = 'Europe/Sarajevo';
