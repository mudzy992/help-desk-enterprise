import { IntegrationJobStatus, IntegrationJobType } from '../../generated/prisma/enums';
import { terminalJobPayloadRedactedMarker } from './integration-queue.constants';
import {
  integrationJobAdminErrorCodes,
  type IntegrationJobResponse,
} from './integration-queue.types';

export function resolveIntegrationJobAdminErrorCode(
  type: IntegrationJobResponse['type'],
  lastError: string | null,
): IntegrationJobResponse['lastErrorCode'] {
  if (lastError === null) return null;
  if (type === IntegrationJobType.TEAMS && lastError === integrationJobAdminErrorCodes.teamsDeliveryPermanentFailure) {
    return integrationJobAdminErrorCodes.teamsDeliveryPermanentFailure;
  }
  if (lastError === integrationJobAdminErrorCodes.teamsDeliverySkipped) {
    return integrationJobAdminErrorCodes.teamsDeliverySkipped;
  }
  if (lastError === integrationJobAdminErrorCodes.teamsConversationGone) {
    return integrationJobAdminErrorCodes.teamsConversationGone;
  }
  if (lastError === integrationJobAdminErrorCodes.processingOutcomeUnknown) {
    return integrationJobAdminErrorCodes.processingOutcomeUnknown;
  }
  if (lastError === integrationJobAdminErrorCodes.providerOutcomeUnknown) {
    return integrationJobAdminErrorCodes.providerOutcomeUnknown;
  }
  if (lastError === integrationJobAdminErrorCodes.payloadLimitExceeded) {
    return integrationJobAdminErrorCodes.payloadLimitExceeded;
  }
  if (
    type === IntegrationJobType.EDGE_EVENT &&
    lastError === integrationJobAdminErrorCodes.edgeEventNoSubscribers
  ) {
    return integrationJobAdminErrorCodes.edgeEventNoSubscribers;
  }
  // Provider messages may contain recipient addresses, response bodies or other
  // secrets. The admin API exposes only a stable generic code for other errors.
  return integrationJobAdminErrorCodes.genericFailure;
}

export function toIntegrationJobResponse(job: {
  readonly id: string;
  readonly type: IntegrationJobResponse['type'];
  readonly status: IntegrationJobStatus;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly nextRetryAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): IntegrationJobResponse {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    lastErrorCode:
      (job.status === IntegrationJobStatus.COMPLETED || job.status === IntegrationJobStatus.PUBLISHED_BEST_EFFORT || job.status === IntegrationJobStatus.SKIPPED) && job.lastError === terminalJobPayloadRedactedMarker
        ? null
        : resolveIntegrationJobAdminErrorCode(job.type, job.lastError),
    attempts: job.attempts,
    nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
