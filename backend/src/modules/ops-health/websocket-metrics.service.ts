import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  addWebsocketEmitListener,
  type WebsocketEmitRoomKind,
  websocketEmitRoomKinds,
} from '../websocket/websocket-emit-counter';
import { RedisService } from '../../common/redis/redis.service';
import { opsRedisKeys, websocketCounterTtlSeconds } from './ops-state.store';

const flushEveryMs = 5_000;

/**
 * Package 5.2.3 (M11 B3): per-process WebSocket emit counts are batched in
 * memory and flushed to Redis every 5 seconds, the same way HTTP counters
 * work (see `http-metrics.service.ts`). Aggregating across instances gives
 * the ops-health collector a cluster-wide emit rate that survives restarts
 * (TTL 70 min covers 60 min of dashboard history plus margin); if Redis is
 * down the pending batch is dropped silently so broadcasts never block.
 */
@Injectable()
export class WebsocketMetricsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('WebsocketMetrics');
  private readonly instanceId = randomUUID();
  private pending = new Map<WebsocketEmitRoomKind, number>();
  private flushTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private warnedAt = 0;

  constructor(private readonly redis: RedisService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.unsubscribe = addWebsocketEmitListener((kind) => {
      this.pending.set(kind, (this.pending.get(kind) ?? 0) + 1);
    });
    this.flushTimer = setInterval(() => void this.flush(), flushEveryMs);
    this.flushTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.flush();
  }

  /** For health-card snapshot: total emits of the last minute, broken down by room. */
  async readLastMinuteTotals(nowMs: number = Date.now()): Promise<Record<WebsocketEmitRoomKind, number>> {
    const minute = Math.floor(nowMs / 60_000) - 1;
    const keys = websocketEmitRoomKinds.map((kind) => opsRedisKeys.websocketEmit(kind, minute));
    const values = await this.redis.getClient().mget(...keys);
    const result = {} as Record<WebsocketEmitRoomKind, number>;
    for (let index = 0; index < websocketEmitRoomKinds.length; index += 1) {
      const parsed = values[index] === null ? 0 : Number.parseInt(values[index]!, 10);
      result[websocketEmitRoomKinds[index]!] = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return result;
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    try {
      const minute = Math.floor(Date.now() / 60_000);
      const pipeline = this.redis.getClient().pipeline();
      for (const kind of websocketEmitRoomKinds) {
        const count = batch.get(kind) ?? 0;
        if (count <= 0) continue;
        const key = opsRedisKeys.websocketEmit(kind, minute);
        pipeline.incrby(key, count);
        pipeline.expire(key, websocketCounterTtlSeconds);
      }
      // Drop a per-instance heartbeat so `readLastMinuteTotals` can tell a
      // quiet minute from a metrics outage (all keys missing = collector down,
      // not zero).
      pipeline.set(
        opsRedisKeys.websocketHeartbeat(this.instanceId),
        String(minute),
        'EX',
        websocketCounterTtlSeconds,
      );
      await pipeline.exec();
    } catch (error) {
      this.warnOnce(error);
    }
  }

  private warnOnce(error: unknown): void {
    const now = Date.now();
    if (now - this.warnedAt < 300_000) return;
    this.warnedAt = now;
    this.logger.warn(`ws_metrics_flush_failed reason=${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }
}
