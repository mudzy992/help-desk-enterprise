import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
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

  async read(key: string): Promise<ReportTrends | null> {
    const client = await this.client();
    if (client === null) return null;
    try {
      const cached = await client.get(key);
      if (cached === null) return null;
      const parsed = JSON.parse(cached) as unknown;
      return isReportTrends(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async write(key: string, value: ReportTrends, ttlSeconds: number): Promise<void> {
    const client = await this.client();
    if (client === null) return;
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // The database stays the source of truth.
    }
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

function isReportTrends(value: unknown): value is ReportTrends {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ReportTrends>;
  return (
    Array.isArray(candidate.points) &&
    typeof candidate.granularity === 'string' &&
    typeof candidate.totals === 'object' &&
    typeof candidate.topServices === 'object'
  );
}
