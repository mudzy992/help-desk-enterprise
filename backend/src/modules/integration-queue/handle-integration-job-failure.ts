import { Queue } from 'bullmq';
import {
  computeIntegrationJobBackoffMilliseconds,
  resolveDeadLetterAttemptThreshold,
} from './compute-integration-job-backoff';
import type { IntegrationJobRepository } from './integration-job.repository';
import type { IntegrationQueueJobData } from './integration-queue.types';
import type { IntegrationQueueSettings } from './integration-queue.types';
import { IntegrationJobType } from '../../generated/prisma/enums';

export async function handleIntegrationJobFailure(input: {
  readonly repository: IntegrationJobRepository;
  readonly queue: Queue<IntegrationQueueJobData>;
  readonly job: {
    readonly id: string;
    readonly type: IntegrationJobType;
    readonly attempts: number;
  };
  readonly settings: IntegrationQueueSettings;
  readonly error: unknown;
  readonly log: (message: string) => void;
}): Promise<'FAILED' | 'DLQ'> {
  const lastError =
    input.error instanceof Error ? input.error.message : String(input.error);
  const threshold = resolveDeadLetterAttemptThreshold(input.settings);
  if (input.job.attempts >= threshold) {
    await input.repository.markDeadLetter(input.job.id, lastError);
    input.log(
      `integration_job id=${input.job.id} type=${input.job.type} status=DLQ attempts=${input.job.attempts}`,
    );
    return 'DLQ';
  }
  const delayMs = computeIntegrationJobBackoffMilliseconds({
    attempts: input.job.attempts,
    initialBackoffSeconds: input.settings.initialBackoffSeconds,
    maxBackoffSeconds: input.settings.maxBackoffSeconds,
  });
  const nextRetryAt = new Date(Date.now() + delayMs);
  await input.repository.markFailed(input.job.id, lastError, nextRetryAt);
  await input.queue.add(
    input.job.type,
    { integrationJobId: input.job.id },
    {
      jobId: `${input.job.id}:${input.job.attempts}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  input.log(
    `integration_job id=${input.job.id} type=${input.job.type} status=FAILED attempts=${input.job.attempts} nextRetryAt=${nextRetryAt.toISOString()}`,
  );
  return 'FAILED';
}
