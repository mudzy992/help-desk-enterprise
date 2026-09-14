import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';

export const integrationQueueName = 'integration';

export const edgeEventRedisChannel = 'integration-queue:edge-event';

export const integrationQueueTypeTokens = {
  email: 'email',
  edge: 'edge',
  teams: 'teams',
} as const;

export const integrationQueueAdminStatuses: readonly IntegrationJobStatus[] = [
  IntegrationJobStatus.PENDING,
  IntegrationJobStatus.FAILED,
  IntegrationJobStatus.DLQ,
];

export const integrationQueueJobTypes = IntegrationJobType;
export const integrationQueueJobStatuses = IntegrationJobStatus;
