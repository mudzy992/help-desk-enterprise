import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
import {
  readReportCacheValue,
  writeReportCacheEntry,
} from '../cache/report-cache-envelope';
import { parseReportTrendsCache } from '../cache/parse-report-trends-cache';
import type { ReportTrends } from './report-trends.types';

export const reportTrendsCacheKeyPrefix = 'reports:trends';

/**
 * Paket 2.5 (design §4.1): computed trends in Redis. Past buckets never change,
 * so the TTL (setting, default 10 min) only bounds how stale the running bucket
 * may look. Every failure degrades to „no cache”.
 */
@Injectable()
export class ReportTrendsCache {
  constructor(@Optional() @Inject(redisTokens.client) private readonly redis?: Redis) {}

  /**
   * W7.105 (`BA-reports-15`): versioned envelope + strict, bounded validation (`parse-report-trends-cache.ts`). A
   * value from another build is a miss; the TTL then bounds how long it costs anything.
   */
  async read(key: string): Promise<ReportTrends | null> {
    const client = await this.client();
    if (client === null) return null;
    return readReportCacheValue(client, key, parseReportTrendsCache);
  }

  async write(key: string, value: ReportTrends, ttlSeconds: number): Promise<void> {
    const client = await this.client();
    if (client === null) return;
    await writeReportCacheEntry(client, key, value, ttlSeconds);
  }

  private async client(): Promise<Redis | null> {
    if (this.redis === undefined) return null;
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis;
    } catch {
      return null;
    }
  }
}

export function reportTrendsCacheKey(parts: Readonly<Record<string, string | number | null | undefined>>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((name) => `${name}=${parts[name] ?? ''}`)
    .join('&');
  return `${reportTrendsCacheKeyPrefix}:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}
