import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  assetOperationsMetricWindowMinutes,
  type AssetOperationsMetricCounts,
} from './asset-operations.types';

export const assetOperationsMetricEvents = {
  directorySyncOverlap: 'directory_sync_overlap',
  auditWriteFailure: 'audit_write_failure',
} as const;

export type AssetOperationsMetricEvent =
  (typeof assetOperationsMetricEvents)[keyof typeof assetOperationsMetricEvents];

export const assetOperationsMetricKey = (event: AssetOperationsMetricEvent, minute: number) =>
  `assets:ops:${event}:${minute}`;

/** The last-hour query reads 60 complete buckets; keep one extra margin minute. */
export const assetOperationsMetricTtlSeconds = 70 * 60;
export const assetOperationsMetricWriteTimeoutMs = 250;

const incrementWithTtlScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Redis-backed, low-cardinality asset counters. Bucket keys contain only a
 * fixed event name and a minute number; no user, recipient, asset, or file id.
 */
export class AssetOperationsMetricStore {
  constructor(private readonly redis: Pick<Redis, 'eval' | 'mget'>) {}

  async increment(event: AssetOperationsMetricEvent, now: Date = new Date()): Promise<void> {
    const minute = Math.floor(now.getTime() / 60_000);
    await this.redis.eval(
      incrementWithTtlScript,
      1,
      assetOperationsMetricKey(event, minute),
      assetOperationsMetricTtlSeconds,
    );
  }

  /** Sums the previous 60 complete minute buckets (never the in-progress minute). */
  async readLastHour(now: Date = new Date()): Promise<AssetOperationsMetricCounts> {
    const currentMinute = Math.floor(now.getTime() / 60_000);
    const minutes = Array.from(
      { length: assetOperationsMetricWindowMinutes },
      (_, index) => currentMinute - assetOperationsMetricWindowMinutes + index,
    );
    const events = Object.values(assetOperationsMetricEvents);
    const keys = events.flatMap((event) =>
      minutes.map((minute) => assetOperationsMetricKey(event, minute)),
    );
    const values = await this.redis.mget(...keys);
    const counts = new Map<AssetOperationsMetricEvent, number>();
    events.forEach((event, eventIndex) => {
      const offset = eventIndex * minutes.length;
      const total = values
        .slice(offset, offset + minutes.length)
        .reduce((sum, value) => sum + parseMetricCount(value), 0);
      counts.set(event, total);
    });
    return {
      directorySyncOverlapsLastHour: counts.get(assetOperationsMetricEvents.directorySyncOverlap) ?? 0,
      auditWriteFailuresLastHour: counts.get(assetOperationsMetricEvents.auditWriteFailure) ?? 0,
    };
  }
}

@Injectable()
export class AssetOperationsMetrics {
  private readonly store: AssetOperationsMetricStore;

  constructor(@Inject(redisTokens.client) redis: Redis) {
    this.store = new AssetOperationsMetricStore(redis);
  }

  recordAuditWriteFailure(): Promise<void> {
    return this.recordBestEffort(assetOperationsMetricEvents.auditWriteFailure);
  }

  recordDirectorySyncOverlap(): Promise<void> {
    return this.recordBestEffort(assetOperationsMetricEvents.directorySyncOverlap);
  }

  private async recordBestEffort(event: AssetOperationsMetricEvent): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.store.increment(event),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, assetOperationsMetricWriteTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function parseMetricCount(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/u.test(value)) throw new Error('invalid asset operations metric count');
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error('invalid asset operations metric count');
  return count;
}
