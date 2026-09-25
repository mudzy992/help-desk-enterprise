/**
 * Package 1.3 (T3/T4): the timer safety-net sweep. Every 5 minutes, at second 30
 * so it never starts together with the quarter-hourly sweeps (second 0).
 */
export const timeTrackingSweepQueueName = 'ticket-time-tracking-sweep';
export const timeTrackingSweepJobName = 'ticket-time-tracking-sweep';
export const timeTrackingSweepSchedulerId = 'ticket-time-tracking-sweep-5min';
export const timeTrackingSweepSchedulePattern = '30 */5 * * * *';
export const timeTrackingSweepJobAttempts = 2;
export const timeTrackingSweepJobBackoffMilliseconds = 30000;
export const timeTrackingSweepJobTimeoutMilliseconds = 120000;
export const timeTrackingSweepCompletedJobsToKeep = 20;
export const timeTrackingSweepFailedJobsToKeep = 50;
export const timeTrackingSweepJobLabel = 'ticket_time_tracking_sweep';
export const timeTrackingSweepJobLogContext = 'TimeTrackingSweepJob';
