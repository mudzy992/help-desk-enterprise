import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';

/*
  Paket 5.4.0-b (M2): aggregate login-security counters. The limiter and the
  MFA verification increment per-minute buckets in Redis; the admin endpoint
  aggregates the last hour. Keys carry only the event name and the minute
  bucket — no account, IP or any other PII — matching the design's
  "agregira (ne vraća PII)".
*/

export type LoginSecurityMetricEvent = 'login-429' | 'login-account-delays' | 'mfa-failures';

export const loginSecurityMetricEvents: readonly LoginSecurityMetricEvent[] = [
  'login-429',
  'login-account-delays',
  'mfa-failures',
];

const keyPrefix = 'security:metrics:';
const bucketTtlSeconds = 2 * 60 * 60;
export const metricsWindowMinutes = 60;

const incrementWithExpiry =
  "local count = redis.call('INCR', KEYS[1]); " +
  'if count == 1 then redis.call(\'EXPIRE\', KEYS[1], ARGV[1]); end; ' +
  'return count';

export type LoginSecurityMetricSeries = {
  readonly total: number;
  readonly peakPerMinute: number;
  /** Oldest to newest, one point per minute of the last hour. */
  readonly points: readonly { readonly at: string; readonly count: number }[];
};

export type LoginSecurityMetricsSnapshot = {
  readonly generatedAt: string;
  readonly windowSeconds: number;
  readonly metrics: Readonly<Record<LoginSecurityMetricEvent, LoginSecurityMetricSeries>>;
};

export function metricsBucketKey(event: LoginSecurityMetricEvent, minuteBucket: number): string {
  return `${keyPrefix}${event}:${minuteBucket}`;
}

export function minuteBucketOf(now: Date): number {
  return Math.floor(now.getTime() / 60_000);
}

interface MetricsStore {
  increment(key: string, ttlSeconds: number): Promise<void>;
  readMany(keys: readonly string[]): Promise<Array<number | null>>;
}

function createRedisMetricsStore(redis: Redis): MetricsStore {
  return {
    async increment(key, ttlSeconds) {
      await redis.eval(incrementWithExpiry, 1, key, String(ttlSeconds));
    },
    async readMany(keys) {
      if (keys.length === 0) return [];
      const values = await redis.mget(...keys);
      return values.map((value) => (value === null || value === undefined ? null : Number(value)));
    },
  };
}

function createMemoryMetricsStore(now: () => number = Date.now): MetricsStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  return {
    async increment(key, ttlSeconds) {
      const entry = entries.get(key);
      if (entry !== undefined && entry.expiresAt > now()) {
        entry.count += 1;
        return;
      }
      entries.set(key, { count: 1, expiresAt: now() + ttlSeconds * 1000 });
    },
    async readMany(keys) {
      return keys.map((key) => {
        const entry = entries.get(key);
        if (entry === undefined || entry.expiresAt <= now()) return null;
        return entry.count;
      });
    },
  };
}

@Injectable()
export class LoginSecurityMetricsService {
  private readonly store: MetricsStore;

  constructor(@Optional() @Inject(redisTokens.client) redis?: Redis) {
    this.store = redis === undefined || redis === null ? createMemoryMetricsStore() : createRedisMetricsStore(redis);
  }

  /** Best-effort by design: metrics must never break the login path. */
  async record(event: LoginSecurityMetricEvent, now: Date = new Date()): Promise<void> {
    try {
      await this.store.increment(metricsBucketKey(event, minuteBucketOf(now)), bucketTtlSeconds);
    } catch {
      // A metrics write that fails says nothing about the sign-in itself.
    }
  }

  async lastHour(now: Date = new Date()): Promise<LoginSecurityMetricsSnapshot> {
    const newestBucket = minuteBucketOf(now);
    const buckets = Array.from({ length: metricsWindowMinutes }, (_, index) => newestBucket - (metricsWindowMinutes - 1 - index));
    const metrics = {} as Record<LoginSecurityMetricEvent, LoginSecurityMetricSeries>;
    for (const event of loginSecurityMetricEvents) {
      const counts = await this.store.readMany(buckets.map((bucket) => metricsBucketKey(event, bucket)));
      const points = buckets.map((bucket, index) => ({
        at: new Date(bucket * 60_000).toISOString(),
        count: counts[index] ?? 0,
      }));
      const total = points.reduce((sum, point) => sum + point.count, 0);
      const peakPerMinute = points.reduce((peak, point) => Math.max(peak, point.count), 0);
      metrics[event] = { total, peakPerMinute, points };
    }
    return {
      generatedAt: now.toISOString(),
      windowSeconds: metricsWindowMinutes * 60,
      metrics,
    };
  }
}
