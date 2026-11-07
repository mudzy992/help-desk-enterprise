import { Queue } from 'bullmq';
import { IntegrationJobType } from '../../generated/prisma/enums';
import {
  classifyMailSendError,
  isPermanentRecipientFailure,
} from '../notifications/email/classify-mail-send-error';
import { readMailSuppressionRetryAfterSeconds } from '../notifications/email/mail-provider-limit-breaker';
import {
  NotificationEmailDeliveryDeadError,
  NotificationEmailOutcomeUnknownError,
} from '../notifications/email/notification-email-delivery-errors';
import {
  computeIntegrationJobBackoffMilliseconds,
  resolveDeadLetterAttemptThreshold,
} from './compute-integration-job-backoff';
import type { IntegrationJobRepository } from './integration-job.repository';
import type { IntegrationQueueJobData } from './integration-queue.types';
import type { IntegrationQueueSettings } from './integration-queue.types';

/** Rezerva na granici isteka blokade, da buđenje ne padne unutar iste sekunde. */
const providerBlockRetryMarginSeconds = 60;

export async function handleIntegrationJobFailure(input: {
  readonly repository: IntegrationJobRepository;
  readonly queue: Queue<IntegrationQueueJobData>;
  readonly job: {
    readonly id: string;
    readonly type: IntegrationJobType;
    readonly attempts: number;
    readonly payload?: unknown;
  };
  readonly settings: IntegrationQueueSettings;
  readonly error: unknown;
  readonly log: (message: string) => void;
}): Promise<'FAILED' | 'DLQ'> {
  const lastError =
    input.error instanceof Error ? input.error.message : String(input.error);
  const threshold = resolveDeadLetterAttemptThreshold(input.settings);
  // Odbijena adresa („550 no such user") se ponavljanjem ne popravlja: deset
  // pokušaja kroz sate samo troši red i odgađa DLQ alarm. Sve ostalo — uključujući
  // ograničenje provajdera (prekidač) i mrežne greške — ide uobičajenim backoffom.
  const recipientRejected =
    input.job.type === IntegrationJobType.EMAIL &&
    isPermanentRecipientFailure(classifyMailSendError(input.error).kind);
  const emailOutcomeUnknown = input.error instanceof NotificationEmailOutcomeUnknownError;
  const emailAlreadyDead = input.error instanceof NotificationEmailDeliveryDeadError;
  if (
    emailOutcomeUnknown ||
    emailAlreadyDead ||
    recipientRejected ||
    input.job.attempts >= threshold
  ) {
    if (input.job.type === IntegrationJobType.EMAIL && input.job.payload !== undefined) {
      await input.repository.markEmailDeliveryDead(input.job.payload);
    }
    await input.repository.markDeadLetter(input.job.id, lastError);
    const reason = emailOutcomeUnknown
      ? ' reason=outcome_unknown_no_resend'
      : emailAlreadyDead
        ? ' reason=delivery_dead'
        : recipientRejected
          ? ' reason=recipient_rejected'
          : '';
    input.log(
      `integration_job id=${input.job.id} type=${input.job.type} status=DLQ attempts=${input.job.attempts}${reason}`,
    );
    return 'DLQ';
  }
  const backoffMs = computeIntegrationJobBackoffMilliseconds({
    attempts: input.job.attempts,
    initialBackoffSeconds: input.settings.initialBackoffSeconds,
    maxBackoffSeconds: input.settings.maxBackoffSeconds,
  });
  // Prekidač za limit provajdera je otvoren: buđenje prije isteka blokade samo
  // troši pokušaje (deset ih je do DLQ-a, a dnevna kvota zna trajati satima).
  // Zato posao čeka do kraja blokade, uz minut rezerve na granici.
  const suppressedRetryAfterSeconds = readMailSuppressionRetryAfterSeconds(input.error);
  const delayMs =
    suppressedRetryAfterSeconds === null
      ? backoffMs
      : Math.max(backoffMs, (suppressedRetryAfterSeconds + providerBlockRetryMarginSeconds) * 1_000);
  const nextRetryAt = new Date(Date.now() + delayMs);
  await input.repository.markFailed(input.job.id, lastError, nextRetryAt);
  if (input.job.type === IntegrationJobType.EMAIL && input.job.payload !== undefined) {
    // Persist the ledger's due time before crossing the Redis boundary. If
    // queue.add is lost, the durable IntegrationJob row and email ledger agree
    // and the periodic dispatcher will enqueue the same logical attempt at due time.
    await input.repository.scheduleEmailDeliveryRetry(input.job.payload, nextRetryAt);
  }
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
    `integration_job id=${input.job.id} type=${input.job.type} status=FAILED attempts=${input.job.attempts} nextRetryAt=${nextRetryAt.toISOString()}${
      suppressedRetryAfterSeconds === null ? '' : ' reason=mail_provider_blocked'
    }`,
  );
  return 'FAILED';
}
