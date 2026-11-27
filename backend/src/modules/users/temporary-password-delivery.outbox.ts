import type { JsonValue } from '../change-log/change-log.types';
import type { Prisma } from '../../generated/prisma/client';
import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';

/**
 * W2.26 (`BA-users-02`): the durable half of "create an account, hand over the
 * credentials".
 *
 * The finding: user, password and role were three commits, the role refused last,
 * and the secret had already been mailed. Now the whole intent commits once and the
 * e-mail channel becomes a row in the existing transactional outbox.
 *
 * What the row deliberately does **not** carry is the temporary password. A
 * plaintext credential in a database table would trade one defect (a secret for a
 * failed operation) for a worse one (a secret at rest). The intent therefore
 * requests a credential, and the delivery worker issues and mails one under the
 * same retry budget as any other durable side effect.
 */
export const temporaryPasswordDeliveryTopic = 'users.temporary-password-delivery';

/** E-mail delivery is not worth 20 attempts: 8 is a day of backoff, then a human. */
export const temporaryPasswordDeliveryMaxAttempts = 8;

export type TemporaryPasswordDeliveryPayload = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
};

export const temporaryPasswordDeliveryDedupeKey = (userId: string): string =>
  `user:${userId}:create`;

export function toTemporaryPasswordDeliveryPayload(
  input: TemporaryPasswordDeliveryPayload,
): JsonValue {
  return {
    userId: input.userId,
    email: input.email,
    displayName: input.displayName,
  };
}

export const invalidTemporaryPasswordDeliveryPayload =
  'TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID';

/** Strict on purpose: a corrupted row must dead-letter, never mail a guess. */
export function readTemporaryPasswordDeliveryPayload(
  payload: JsonValue,
): TemporaryPasswordDeliveryPayload {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(invalidTemporaryPasswordDeliveryPayload);
  }
  const record = payload as Record<string, JsonValue>;
  const { userId, email, displayName } = record;
  if (
    typeof userId !== 'string' ||
    userId.trim().length === 0 ||
    typeof email !== 'string' ||
    email.trim().length === 0 ||
    typeof displayName !== 'string'
  ) {
    throw new Error(invalidTemporaryPasswordDeliveryPayload);
  }
  return { userId, email, displayName };
}

/**
 * Written on the caller's transaction, so the intent commits or disappears with the
 * account it describes: a failed create never queues a delivery, and a committed
 * account is never left without one.
 */
export async function enqueueTemporaryPasswordDelivery(
  outbox: Pick<TransactionalOutboxService, 'enqueue'> | undefined,
  transaction: Prisma.TransactionClient,
  input: TemporaryPasswordDeliveryPayload,
): Promise<void> {
  if (outbox === undefined) return;
  await outbox.enqueue(transaction, {
    topic: temporaryPasswordDeliveryTopic,
    dedupeKey: temporaryPasswordDeliveryDedupeKey(input.userId),
    payload: toTemporaryPasswordDeliveryPayload(input),
    maxAttempts: temporaryPasswordDeliveryMaxAttempts,
  });
}
