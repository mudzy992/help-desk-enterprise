import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { httpCounterTtlSeconds, opsRedisKeys } from './ops-state.store';

const flushEveryMs = 5_000;
const eventLoopReportEveryMs = 60_000;
const eventLoopKeyTtlSeconds = 180;

/**
 * Paket 2.7 (§4.3, §4.6): per-minute request and 5xx counters for the alarm
 * and the dashboard graph, plus the API event-loop delay. Counts are kept in
 * memory and flushed every 5 s in one pipeline, so a request costs no Redis
 * round trip; if Redis is down the counts are dropped silently. `/health/*`
 * is not counted (monitors would otherwise measure themselves). The existing
 * log-only monitors (RequestMetricsMiddleware, event-loop-lag.monitor) stay as
 * they are; this adds the shared, alarm-ready numbers.
 */
@Injectable()
export class HttpMetricsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('HttpMetrics');
  private readonly instanceId = randomUUID();
  private pending = new Map<number, { total: number; errors5xx: number }>();
  private flushTimer: NodeJS.Timeout | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private histogram: IntervalHistogram | null = null;
  private warnedAt = 0;

  constructor(private readonly redis: RedisService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.flushTimer = setInterval(() => void this.flush(), flushEveryMs);
    this.flushTimer.unref();
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();
    this.loopTimer = setInterval(() => void this.reportEventLoop(), eventLoopReportEveryMs);
    this.loopTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    if (this.loopTimer !== null) clearInterval(this.loopTimer);
    this.histogram?.disable();
    await this.flush();
  }

  record(path: string, statusCode: number, nowMs: number = Date.now()): void {
    if (path === '/health' || path.startsWith('/health/') || path.startsWith('/api/health')) return;
    const minute = Math.floor(nowMs / 60_000);
    const entry = this.pending.get(minute) ?? { total: 0, errors5xx: 0 };
    entry.total += 1;
    if (statusCode >= 500) entry.errors5xx += 1;
    this.pending.set(minute, entry);
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    try {
      const pipeline = this.redis.getClient().pipeline();
      for (const [minute, counts] of batch) {
        pipeline.incrby(opsRedisKeys.httpTotal(minute), counts.total);
        pipeline.expire(opsRedisKeys.httpTotal(minute), httpCounterTtlSeconds);
        if (counts.errors5xx > 0) {
          pipeline.incrby(opsRedisKeys.http5xx(minute), counts.errors5xx);
          pipeline.expire(opsRedisKeys.http5xx(minute), httpCounterTtlSeconds);
        }
      }
      await pipeline.exec();
    } catch (error) {
      this.warnOnce(error);
    }
  }

  private async reportEventLoop(): Promise<void> {
    const histogram = this.histogram;
    if (histogram === null) return;
    const meanMs = histogram.mean / 1e6;
    histogram.reset();
    if (!Number.isFinite(meanMs)) return;
    try {
      await this.redis.getClient().set(opsRedisKeys.eventLoop(this.instanceId), meanMs.toFixed(1), 'EX', eventLoopKeyTtlSeconds);
    } catch (error) {
      this.warnOnce(error);
    }
  }

  private warnOnce(error: unknown): void {
    const now = Date.now();
    if (now - this.warnedAt < 300_000) return;
    this.warnedAt = now;
    this.logger.warn(`http_metrics_flush_failed reason=${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }
}

type MinimalResponse = { readonly statusCode?: number; once(event: 'finish', listener: () => void): unknown };
type MinimalRequest = { readonly originalUrl?: string; readonly url?: string };

/** Express-style middleware bound in `main.ts`; the work happens after the response. */
export function createHttpMetricsMiddleware(metrics: Pick<HttpMetricsService, 'record'>) {
  return (request: MinimalRequest, response: MinimalResponse, next: () => void): void => {
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
    response.once('finish', () => metrics.record(path, response.statusCode ?? 0));
    next();
  };
}
