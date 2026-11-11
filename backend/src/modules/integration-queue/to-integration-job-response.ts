import type { IntegrationJobStatus } from '../../generated/prisma/enums';
import type { IntegrationJobResponse } from './integration-queue.types';

export function toIntegrationJobResponse(job: {
  readonly id: string;
  readonly type: IntegrationJobResponse['type'];
  readonly status: IntegrationJobStatus;
  readonly payload: unknown;
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
    payload: job.payload,
    lastError: job.lastError,
    attempts: job.attempts,
    nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
