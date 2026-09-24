import {
  workerHeartbeatIntervalMilliseconds,
  workerHeartbeatTimeToLiveSeconds,
} from './integration-queue.constants';

/**
 * Phase 4.1 (plan §4.1): the two worker-maintenance jobs of the integration queue.
 *
 * Both used to be `setInterval` timers inside the worker. Timers are per-process:
 * with two workers the heartbeat was simply written twice (harmless) and the DLQ
 * sweep ran twice against the same rows (wasteful, and the reason the plan asks for
 * a queue-owned schedule). As BullMQ schedulers they are registered in Redis under
 * a stable id, so N workers converge on exactly one occurrence per interval and the
 * queue's lock decides which worker runs it.
 *
 * Each entry also documents its own budget and dead-letter policy:
 * - `lockDuration` on the processor is the timeout enforcement (BullMQ v5 has no
 *   per-job `opts.timeout`; the Pro edition does). It is set to the longest job on
 *   the queue, so a heartbeat that stalls is reclaimed within two minutes.
 * - attempts + exponential backoff for the DLQ sweep (a transient DB error should
 *   not wait a full interval for the next attempt); the heartbeat is not retried —
 *   the next tick is five seconds away and a late heartbeat is worthless.
 * - keep-counts are the queue's dead-letter view: failed jobs stay inspectable.
 */
export const integrationWorkerMaintenanceQueueName =
  'integration-worker-maintenance';

export const integrationWorkerHeartbeatJobName = 'integration-worker-heartbeat';
export const integrationWorkerHeartbeatSchedulerId =
  'integration-worker-heartbeat-every';
export const integrationWorkerHeartbeatRepeatEveryMilliseconds =
  workerHeartbeatIntervalMilliseconds;
export const integrationWorkerHeartbeatJobAttempts = 1;
export const integrationWorkerHeartbeatJobBackoffMilliseconds = 5_000;
export const integrationWorkerHeartbeatCompletedJobsToKeep = 5;
export const integrationWorkerHeartbeatFailedJobsToKeep = 20;
export const integrationWorkerHeartbeatJobLabel = 'integration_worker_heartbeat';
export const integrationWorkerHeartbeatJobLogContext =
  'IntegrationWorkerHeartbeatJob';

export const integrationDlqRetentionJobName = 'integration-dlq-retention';
export const integrationDlqRetentionSchedulerId =
  'integration-dlq-retention-interval';
export const integrationDlqRetentionJobAttempts = 2;
export const integrationDlqRetentionJobBackoffMilliseconds = 30_000;
export const integrationDlqRetentionCompletedJobsToKeep = 20;
export const integrationDlqRetentionFailedJobsToKeep = 50;
export const integrationDlqRetentionJobLabel = 'integration_dlq_retention';
export const integrationDlqRetentionJobLogContext = 'IntegrationDlqRetentionJob';

/** The longest job on the queue bounds how long a stalled run may hold its lock. */
export const integrationWorkerMaintenanceLockDurationMilliseconds = 120_000;

/**
 * The heartbeat expires faster than the scheduled interval, which is why the job
 * also runs once at worker boot (`IntegrationQueueWorkerHeartbeatService`): without
 * that immediate write the health check would flap for the first interval.
 */
export const integrationWorkerHeartbeatTimeToLiveSecondsValue =
  workerHeartbeatTimeToLiveSeconds;
