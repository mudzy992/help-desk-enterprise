import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';

/*
  Paket 5.4.0-a (M1): one-time WebAuthn challenges and step-up confirmations.

  Challenges are single-use and short-lived: the same shape as the rate-limit
  stores — Redis when the client is present, an in-memory map otherwise (tests
  and single-process dev). Keys are namespaced so registration, sign-in and
  step-up ceremonies cannot consume each other's challenges.
*/

export type PasskeyChallengeStore = {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Returns the value and deletes it — a challenge is consumed once. */
  consume(key: string): Promise<string | null>;
  peek(key: string): Promise<string | null>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
};

export function createMemoryPasskeyChallengeStore(now: () => number = Date.now): PasskeyChallengeStore {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const alive = (key: string): boolean => {
    const entry = entries.get(key);
    return entry !== undefined && entry.expiresAt > now();
  };
  return {
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async consume(key) {
      const entry = entries.get(key);
      if (entry === undefined || entry.expiresAt <= now()) return null;
      entries.delete(key);
      return entry.value;
    },
    async peek(key) {
      const entry = entries.get(key);
      if (entry === undefined || entry.expiresAt <= now()) return null;
      return entry.value;
    },
    async setIfAbsent(key, value, ttlSeconds) {
      const entry = entries.get(key);
      if (entry !== undefined && entry.expiresAt > now()) return false;
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
      return true;
    },
  };
}

export function createRedisPasskeyChallengeStore(redis: Redis): PasskeyChallengeStore {
  return {
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
    },
    async consume(key) {
      // MULTI/EXEC instead of GETDEL: GETDEL needs Redis 6.2+; the queued pair
      // is atomic on every Redis the deployment already runs.
      const result = await redis.multi().get(key).del(key).exec();
      const value = result?.[0]?.[1];
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async peek(key) {
      const value = await redis.get(key);
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async setIfAbsent(key, value, ttlSeconds) {
      const set = await redis.set(key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds)), 'NX');
      return set === 'OK';
    },
  };
}

@Injectable()
export class PasskeyChallengeStoreProvider {
  readonly store: PasskeyChallengeStore;

  constructor(@Optional() @Inject(redisTokens.client) redis?: Redis) {
    this.store = redis === undefined ? createMemoryPasskeyChallengeStore() : createRedisPasskeyChallengeStore(redis);
  }
}
