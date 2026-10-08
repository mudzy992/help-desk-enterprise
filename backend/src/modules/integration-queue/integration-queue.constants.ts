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
export const workerHeartbeatTimeToLiveSeconds = 30;

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
