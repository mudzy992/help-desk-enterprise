import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';

export const integrationQueueName = 'integration';

/** Fixed-size, stable cursor pages for the Admin → Operations queue table. */
export const integrationQueueAdminPageSize = 50;

export const edgeEventRedisChannel = 'integration-queue:edge-event';

export const workerHeartbeatRedisKey = 'integration-queue:worker-heartbeat';
export const workerHeartbeatIntervalMilliseconds = 10_000;
export const workerHeartbeatStaleThresholdMilliseconds =
  workerHeartbeatIntervalMilliseconds * 2;
/**
 * The key MUST outlive the staleness threshold (120 s), otherwise a dead worker
 * leaves *no* value instead of an *old* one — and "no value" is exactly what an
 * evicted key, a cold start and a failed read also look like.
 *
 * Incident 2026-10-16: the TTL was 90 s, so `worker.down` could only ever fire
 * on a missing key. A freshly installed stack therefore paged CRITICAL
 * "Worker ne radi" while the worker was healthy. With an hour of TTL the
 * watchdog sees the last timestamp and can tell the two cases apart.
 */
export const workerHeartbeatTimeToLiveSeconds = 3_600;

export const integrationQueueTypeTokens = {
  email: 'email',
  edge: 'edge',
  teams: 'teams',
} as const;

export const integrationQueueAdminStatuses: readonly IntegrationJobStatus[] = [
  IntegrationJobStatus.PENDING,
  IntegrationJobStatus.PROCESSING,
  IntegrationJobStatus.COMPLETED,
  IntegrationJobStatus.FAILED,
  IntegrationJobStatus.DLQ,
];

export const integrationQueueJobTypes = IntegrationJobType;
export const integrationQueueJobStatuses = IntegrationJobStatus;
