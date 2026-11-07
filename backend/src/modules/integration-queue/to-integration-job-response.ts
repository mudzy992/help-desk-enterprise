import { IntegrationJobType } from '../../generated/prisma/enums';
import type { IntegrationJobStatus } from '../../generated/prisma/enums';
import {
  integrationJobAdminErrorCodes,
  type IntegrationJobResponse,
} from './integration-queue.types';

function toSafeErrorCode(
  type: IntegrationJobResponse['type'],
  lastError: string | null,
): IntegrationJobResponse['lastErrorCode'] {
  if (lastError === null) return null;
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
    lastErrorCode: toSafeErrorCode(job.type, job.lastError),
    attempts: job.attempts,
    nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
