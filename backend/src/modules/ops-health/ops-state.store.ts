import type Redis from 'ioredis';
import type { AlertStreak } from './alert-state-machine';
import type { DlqBaseline } from './evaluate-ops-signals';

/**
 * Paket 2.7: small Redis state of the monitoring (keys go through the client's
 * key prefix). Streaks and the DLQ baseline have no TTL - they are tiny and
 * must survive a quiet night; the silence and the snapshot expire by design.
 */
export const opsRedisKeys = {
  streaks: 'ops:streak',
  silence: 'ops:silence',
  dlqBaseline: 'ops:baseline:dlq',
  snapshot: 'ops:snapshot',
  watchdogLock: 'ops:watchdog:lock',
  http5xx: (minute: number) => `ops:http:5xx:${minute}`,
  httpTotal: (minute: number) => `ops:http:total:${minute}`,
  eventLoop: (instanceId: string) => `ops:eventloop:${instanceId}`,
  eventLoopPattern: 'ops:eventloop:*',
  /** Per-minute WebSocket emit counter per room kind (M11 B3). */
  websocketEmit: (kind: string, minute: number) => `ops:ws:emit:${kind}:${minute}`,
  /** Per-instance heartbeat written every flush; TTL matches counter TTL. */
  websocketHeartbeat: (instanceId: string) => `ops:ws:hb:${instanceId}`,
  websocketHeartbeatPattern: 'ops:ws:hb:*',
} as const;

export const opsSnapshotTtlSeconds = 300;
/** 60 min of the 5xx mini-graph plus a margin. */
export const httpCounterTtlSeconds = 70 * 60;
/** 60 min of per-minute WebSocket emit counters plus a margin. */
export const websocketCounterTtlSeconds = 70 * 60;

export type OpsSilence = {
  readonly until: string;
  readonly reason: string;
  readonly byUserId: string;
};

export class OpsStateStore {
  constructor(private readonly redis: Redis) {}

  async readStreaks(keys: readonly string[]): Promise<Map<string, AlertStreak>> {
    const result = new Map<string, AlertStreak>();
    if (keys.length === 0) return result;
    const values = await this.redis.hmget(opsRedisKeys.streaks, ...keys);
    keys.forEach((key, index) => result.set(key, parseStreak(values[index] ?? null)));
    return result;
  }

  async writeStreaks(streaks: ReadonlyMap<string, AlertStreak>): Promise<void> {
    if (streaks.size === 0) return;
    const flat: string[] = [];
    for (const [key, streak] of streaks) flat.push(key, `${streak.positive}:${streak.negative}`);
    await this.redis.hset(opsRedisKeys.streaks, ...flat);
  }

  async readSilence(now: Date): Promise<OpsSilence | null> {
    const raw = await this.redis.get(opsRedisKeys.silence);
    if (raw === null) return null;
    try {
      const silence = JSON.parse(raw) as OpsSilence;
      return Date.parse(silence.until) > now.getTime() ? silence : null;
    } catch {
      return null;
    }
  }

  async writeSilence(silence: OpsSilence, now: Date): Promise<void> {
    const ttl = Math.max(1, Date.parse(silence.until) - now.getTime());
    await this.redis.set(opsRedisKeys.silence, JSON.stringify(silence), 'PX', ttl);
  }

  async clearSilence(): Promise<boolean> {
    return (await this.redis.del(opsRedisKeys.silence)) > 0;
  }

  async readDlqBaseline(): Promise<DlqBaseline | null> {
    const raw = await this.redis.get(opsRedisKeys.dlqBaseline);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as DlqBaseline;
      return typeof parsed.integrationDlq === 'number' && typeof parsed.failedByQueue === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  async writeDlqBaseline(baseline: DlqBaseline): Promise<void> {
    await this.redis.set(opsRedisKeys.dlqBaseline, JSON.stringify(baseline));
  }

  async writeSnapshot(snapshot: unknown): Promise<void> {
    await this.redis.set(opsRedisKeys.snapshot, JSON.stringify(snapshot), 'EX', opsSnapshotTtlSeconds);
  }

  async readSnapshot<T>(): Promise<T | null> {
    const raw = await this.redis.get(opsRedisKeys.snapshot);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** One API instance per minute runs the watchdog. */
  async acquireWatchdogLock(owner: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(opsRedisKeys.watchdogLock, owner, 'PX', ttlMs, 'NX')) === 'OK';
  }

  /** 5xx and total per minute for the last `minutes` complete minutes (oldest first). */
  async readHttpCounters(currentMinute: number, minutes: number): Promise<Array<{ minute: number; errors5xx: number; total: number }>> {
    const range = Array.from({ length: minutes }, (_, index) => currentMinute - minutes + index);
    const keys = range.flatMap((minute) => [opsRedisKeys.http5xx(minute), opsRedisKeys.httpTotal(minute)]);
    const values = await this.redis.mget(...keys);
    return range.map((minute, index) => ({
      minute,
      errors5xx: toCount(values[index * 2] ?? null),
      total: toCount(values[index * 2 + 1] ?? null),
    }));
  }

  /** WebSocket emit totals (per room kind) for a single minute bucket. */
  async readWebsocketEmitMinute(
    roomKinds: readonly string[],
    minute: number,
  ): Promise<Record<string, number>> {
    if (roomKinds.length === 0) return {};
    const keys = roomKinds.map((kind) => opsRedisKeys.websocketEmit(kind, minute));
    const values = await this.redis.mget(...keys);
    const result: Record<string, number> = {};
    roomKinds.forEach((kind, index) => {
      const value = values[index] ?? null;
      const parsed = value === null ? 0 : Number.parseInt(value, 10);
      result[kind] = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    });
    return result;
  }

  /** Whether any API instance flushed a ws-metrics heartbeat for the given minute. */
  async websocketHeartbeatSeen(minute: number): Promise<boolean> {
    let cursor = '0';
    const prefix = (this.redis.options.keyPrefix ?? '') as string;
    const target = String(minute);
    try {
      do {
        const [next, batch] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}${opsRedisKeys.websocketHeartbeatPattern}`,
          'COUNT',
          100,
        );
        cursor = next;
        if (batch.length === 0) continue;
        const values = await this.redis.mget(...batch);
        for (const value of values) {
          if (value === target) return true;
        }
      } while (cursor !== '0');
    } catch {
      // Treat scan failure as "seen" so we do not false-alarm on a transient
      // Redis hiccup; the counter read is best-effort anyway.
      return true;
    }
    return false;
  }

  /** Worst per-instance mean event-loop delay reported in the last few minutes. */
  async readEventLoopLagMs(): Promise<number | null> {
    let cursor = '0';
    const keys: string[] = [];
    const prefix = (this.redis.options.keyPrefix ?? '') as string;
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${prefix}${opsRedisKeys.eventLoopPattern}`, 'COUNT', 100);
      cursor = next;
      keys.push(...batch.map((key) => (prefix.length > 0 && key.startsWith(prefix) ? key.slice(prefix.length) : key)));
    } while (cursor !== '0' && keys.length < 50);
    if (keys.length === 0) return null;
    const values = await this.redis.mget(...keys);
    let worst: number | null = null;
    for (const value of values) {
      const lag = value === null ? Number.NaN : Number(value);
      if (Number.isFinite(lag)) worst = worst === null ? lag : Math.max(worst, lag);
    }
    return worst;
  }
}

function parseStreak(raw: string | null): AlertStreak {
  if (raw === null) return { positive: 0, negative: 0 };
  const [positive, negative] = raw.split(':').map((part) => Number.parseInt(part, 10));
  return {
    positive: Number.isFinite(positive) && positive! > 0 ? positive! : 0,
    negative: Number.isFinite(negative) && negative! > 0 ? negative! : 0,
  };
}

function toCount(value: string | null): number {
  const parsed = value === null ? 0 : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
