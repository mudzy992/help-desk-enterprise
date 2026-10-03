import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
import type { ReportsDashboard } from './build-reports-dashboard';

export const reportDashboardCacheKeyPrefix = 'reports:dashboard';

/*
 * Paket 2.5 (staging k6 + EXPLAIN, 2026-09-28): one dashboard is ~0.2 s of
 * database CPU (100k tickets, the 60-day KPI window is ~60 % of the table, so
 * a sequential scan is the right plan). Five concurrent users queued to ~1.2 s
 * each. The numbers of a unit do not depend on who asks (access is checked
 * before the service), so the result is cached per unit and window for 60 s —
 * the same bound the owner approved for the dashboard summary — and concurrent
 * misses in one process share a single computation.
 * Override with REPORT_DASHBOARD_CACHE_TTL_SECONDS (positive integer).
 */
function readReportDashboardCacheTtlSeconds(): number {
  const parsed = Number(process.env.REPORT_DASHBOARD_CACHE_TTL_SECONDS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60;
}

export const reportDashboardCacheTtlSeconds = readReportDashboardCacheTtlSeconds();

/** Cache granularity: window bounds and „now” are floored to the minute. */
export const reportDashboardCacheGranularityMs = 60_000;

export function floorToCacheGranularity(value: Date): Date {
  return new Date(Math.floor(value.getTime() / reportDashboardCacheGranularityMs) * reportDashboardCacheGranularityMs);
}

/** ISO bound floored to the minute; unparsable input is left for validation to reject. */
export function floorIsoToCacheGranularity(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : floorToCacheGranularity(parsed).toISOString();
}

export function reportDashboardCacheKey(parts: Readonly<Record<string, string | number | null | undefined>>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((name) => `${name}=${parts[name] ?? ''}`)
    .join('&');
  return `${reportDashboardCacheKeyPrefix}:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

@Injectable()
export class ReportDashboardCache {
  private readonly inFlight = new Map<string, Promise<ReportsDashboard>>();

  constructor(@Optional() @Inject(redisTokens.client) private readonly redis?: Redis) {}

  /** `false` without Redis: callers then keep exact (unfloored) windows. */
  get enabled(): boolean {
    return this.redis !== undefined;
  }

  async getOrCompute(key: string, compute: () => Promise<ReportsDashboard>): Promise<ReportsDashboard> {
    const cached = await this.read(key);
    if (cached !== null) return cached;
    const running = this.inFlight.get(key);
    if (running !== undefined) return running;
    const pending = compute()
      .then(async (value) => {
        await this.write(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return pending;
  }

  private async read(key: string): Promise<ReportsDashboard | null> {
    const client = await this.client();
    if (client === null) return null;
    try {
      const cached = await client.get(key);
      if (cached === null) return null;
      const parsed = JSON.parse(cached) as unknown;
      return isReportsDashboard(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async write(key: string, value: ReportsDashboard): Promise<void> {
    const client = await this.client();
    if (client === null) return;
    try {
      await client.set(key, JSON.stringify(value), 'EX', reportDashboardCacheTtlSeconds);
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

function isReportsDashboard(value: unknown): value is ReportsDashboard {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof ReportsDashboard, unknown>>;
  return (
    typeof candidate.ticketCount === 'number' &&
    candidate.window !== null &&
    typeof candidate.window === 'object' &&
    candidate.kpis !== null &&
    typeof candidate.kpis === 'object' &&
    typeof candidate.bottlenecksEnabled === 'boolean' &&
    Array.isArray(candidate.bottleneckByGroup) &&
    Array.isArray(candidate.serviceVolume) &&
    Array.isArray(candidate.volumeSeries) &&
    candidate.aging !== null &&
    typeof candidate.aging === 'object'
  );
}
