import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../outbox/transactional-outbox.service';
import { CacheInvalidationError, cacheInvalidationErrorCodes } from './cache-invalidation.error';

const namespacePattern = /^[a-z][a-z0-9._-]{2,59}$/u;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const maximumRevision = 2_147_483_647;
const topicPrefix = 'cache.invalidate.';

export type VersionedCacheEntry<Value> = Readonly<{ revision: number; value: Value }>;

@Injectable()
export class CacheInvalidationService {
  constructor(private readonly outbox: TransactionalOutboxService) {}

  async schedule(transaction: Prisma.TransactionClient, input: {
    readonly namespace: string;
    readonly key: string;
    readonly revision: number;
  }): Promise<{ id: string; created: boolean }> {
    validate(input.namespace, input.key, input.revision);
    return this.outbox.enqueue(transaction, {
      topic: topic(input.namespace),
      dedupeKey: `${input.revision}:${createHash('sha256').update(input.key).digest('hex')}`,
      payload: { namespace: input.namespace, key: input.key, revision: input.revision },
      maxAttempts: 20,
    });
  }

  async dispatchOne(namespace: string, invalidate: (event: {
    readonly id: string;
    readonly key: string;
    readonly revision: number;
  }) => Promise<void>): Promise<'idle' | 'succeeded' | 'retry' | 'dead-letter'> {
    validateNamespace(namespace);
    return this.outbox.dispatchOne(topic(namespace), async (delivery) => {
      const event = parsePayload(delivery.payload, namespace);
      await invalidate({ id: delivery.id, key: event.key, revision: event.revision });
    });
  }

  async readThrough<Value>(input: {
    /** Must read the authoritative revision from the database, never from cache. */
    readonly readAuthoritativeRevision: () => Promise<number>;
    readonly readCache: () => Promise<VersionedCacheEntry<Value> | null>;
    /** Must return value and revision from one consistent authoritative snapshot. */
    readonly loadAuthoritativeSnapshot: () => Promise<VersionedCacheEntry<Value>>;
    readonly writeCache: (entry: VersionedCacheEntry<Value>) => Promise<void>;
  }): Promise<{ value: Value; revision: number; source: 'cache' | 'authority' }> {
    const revision = await input.readAuthoritativeRevision();
    assertRevision(revision);
    const cached = await input.readCache();
    if (cached?.revision === revision) return { value: cached.value, revision, source: 'cache' };
    const snapshot = await input.loadAuthoritativeSnapshot();
    assertRevision(snapshot.revision);
    await input.writeCache(snapshot);
    return { value: snapshot.value, revision: snapshot.revision, source: 'authority' };
  }
}

function topic(namespace: string): string {
  return `${topicPrefix}${namespace}`;
}

function validate(namespace: string, key: string, revision: number): void {
  validateNamespace(namespace);
  if (!keyPattern.test(key)) throw new CacheInvalidationError(cacheInvalidationErrorCodes.invalidInput);
  assertRevision(revision);
}

function validateNamespace(namespace: string): void {
  if (!namespacePattern.test(namespace)) throw new CacheInvalidationError(cacheInvalidationErrorCodes.invalidInput);
}

function assertRevision(revision: number): void {
  if (!Number.isInteger(revision) || revision < 1 || revision > maximumRevision) {
    throw new CacheInvalidationError(cacheInvalidationErrorCodes.invalidRevision);
  }
}

function parsePayload(payload: unknown, expectedNamespace: string): { key: string; revision: number } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new CacheInvalidationError(cacheInvalidationErrorCodes.invalidInput);
  }
  const record = payload as Record<string, unknown>;
  if (record['namespace'] !== expectedNamespace || typeof record['key'] !== 'string' || !keyPattern.test(record['key'])) {
    throw new CacheInvalidationError(cacheInvalidationErrorCodes.invalidInput);
  }
  assertRevision(record['revision'] as number);
  return { key: record['key'], revision: record['revision'] as number };
}
