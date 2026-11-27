import type { JsonValue } from '../change-log/change-log.types';
import {
  enqueueTemporaryPasswordDelivery,
  temporaryPasswordDeliveryDedupeKey,
  temporaryPasswordDeliveryMaxAttempts,
  temporaryPasswordDeliveryTopic,
  readTemporaryPasswordDeliveryPayload,
  toTemporaryPasswordDeliveryPayload,
} from './temporary-password-delivery.outbox';

/*
  W2.26 (`BA-users-02`): the durable intent is what makes "the account exists" and
  "the credentials are on their way" one fact instead of two. The contract that has
  to hold: one intent per account, no secret in the payload, and a strict reader so a
  corrupted row dead-letters instead of mailing a guess.
*/
describe('temporary password delivery outbox', () => {
  const intent = { userId: 'user-1', email: 'user@example.com', displayName: 'Test User' };

  it('names exactly one delivery per account', () => {
    expect(temporaryPasswordDeliveryDedupeKey('user-1')).toBe('user:user-1:create');
    expect(temporaryPasswordDeliveryDedupeKey('user-1')).toBe(
      temporaryPasswordDeliveryDedupeKey('user-1'),
    );
    expect(temporaryPasswordDeliveryDedupeKey('user-2')).not.toBe(
      temporaryPasswordDeliveryDedupeKey('user-1'),
    );
    expect(temporaryPasswordDeliveryMaxAttempts).toBe(8);
  });

  it('carries the recipient, never a credential', () => {
    const payload = toTemporaryPasswordDeliveryPayload(intent) as Record<string, JsonValue>;
    expect(Object.keys(payload).sort()).toEqual(['displayName', 'email', 'userId']);
    expect(JSON.stringify(payload)).not.toMatch(/password/iu);
    expect(readTemporaryPasswordDeliveryPayload(payload)).toEqual(intent);
  });

  it('rejects a malformed payload instead of guessing a recipient', () => {
    expect(() => readTemporaryPasswordDeliveryPayload(null as unknown as JsonValue)).toThrow(
      'TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID',
    );
    expect(() => readTemporaryPasswordDeliveryPayload([] as unknown as JsonValue)).toThrow(
      'TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID',
    );
    expect(() =>
      readTemporaryPasswordDeliveryPayload({ userId: 'user-1' } as JsonValue),
    ).toThrow('TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID');
    expect(() =>
      readTemporaryPasswordDeliveryPayload({ ...intent, userId: '  ' } as JsonValue),
    ).toThrow('TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID');
    expect(() =>
      readTemporaryPasswordDeliveryPayload({ ...intent, email: 42 } as unknown as JsonValue),
    ).toThrow('TEMPORARY_PASSWORD_DELIVERY_PAYLOAD_INVALID');
  });

  it('writes the intent on the caller transaction with the shared retry budget', async () => {
    const enqueue = jest.fn(async () => ({ id: 'outbox-1', created: true }));
    const transaction = { outboxMessage: { findUniqueOrThrow: jest.fn() } };

    await enqueueTemporaryPasswordDelivery({ enqueue } as never, transaction as never, intent);

    expect(enqueue).toHaveBeenCalledWith(transaction, {
      topic: temporaryPasswordDeliveryTopic,
      dedupeKey: 'user:user-1:create',
      payload: toTemporaryPasswordDeliveryPayload(intent),
      maxAttempts: 8,
    });
  });

  it('records nothing when there is no outbox to record it in', async () => {
    await expect(
      enqueueTemporaryPasswordDelivery(undefined, {} as never, intent),
    ).resolves.toBeUndefined();
  });
});
