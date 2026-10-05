/**
 * Val 3 (M8/B2): the counters were a module-level `Map` that never evicted
 * anything — the "10 per minute" limit held only for one process (with N
 * instances the real limit was N × 10) and the map grew with every user who ever
 * sent a broadcast.
 *
 * The limiter now uses Redis when it is attached (one fixed one-minute bucket per
 * user, `INCR` + `PEXPIRE`, so the key disappears by itself and every instance
 * sees the same counter), and falls back to the in-memory sliding window when
 * Redis is unreachable — the same fail-open direction as the rest of the system.
 * The in-memory fallback also sweeps itself: users with no stamps inside the
 * window are dropped at most once a minute, so that map cannot grow forever
 * either.
 *
 * The one-minute bucket is a fixed window: at most `limit` accepted per calendar
 * minute per user. That is a deliberate simplification of the old sliding window
 * — cross-instance correctness is what the finding asks for, and a worst case of
 * `limit` at the end of one minute plus `limit` at the start of the next is the
 * standard trade-off of a counter-based limiter.
 */
export const bulkBroadcastRateLimitWindowMs = 60_000;
const inMemorySweepIntervalMs = 60_000;

/** The slice of ioredis this limiter needs; the shared client satisfies it. */
export type BulkBroadcastRateLimiterRedis = {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<unknown>;
};

export class BulkBroadcastRateLimiter {
  private readonly stamps = new Map<string, number[]>();
  private redis: BulkBroadcastRateLimiterRedis | null = null;
  private lastSweepAt = 0;

  /**
   * Hands the limiter the shared Redis client once, at boot (see
   * `BulkBroadcastRateLimiterBootstrap`). Unit tests never attach one, so they
   * exercise the in-memory fallback — exactly what production does when Redis
   * cannot be reached.
   */
  attachRedis(client: BulkBroadcastRateLimiterRedis): void {
    this.redis = client;
  }

  async consume(
    actorUserId: string,
    limitPerMinute: number,
    now = Date.now(),
  ): Promise<boolean> {
    if (this.redis !== null) {
      try {
        return await consumeRedisBucket(this.redis, actorUserId, limitPerMinute, now);
      } catch {
        // Redis refused or dropped the command: keep enforcing locally instead of
        // letting the broadcast through.
      }
    }
    return this.consumeInMemory(actorUserId, limitPerMinute, now);
  }

  private consumeInMemory(
    actorUserId: string,
    limitPerMinute: number,
    now: number,
  ): boolean {
    this.sweepInMemory(now);
    const windowStart = now - bulkBroadcastRateLimitWindowMs;
    const recent = (this.stamps.get(actorUserId) ?? []).filter(
      (stamp) => stamp >= windowStart,
    );
    if (recent.length >= limitPerMinute) {
      this.stamps.set(actorUserId, recent);
      return false;
    }
    recent.push(now);
    this.stamps.set(actorUserId, recent);
    return true;
  }

  /** Drops users whose whole window is in the past; at most once a minute. */
  private sweepInMemory(now: number): void {
    if (now - this.lastSweepAt < inMemorySweepIntervalMs) {
      return;
    }
    this.lastSweepAt = now;
    const windowStart = now - bulkBroadcastRateLimitWindowMs;
    for (const [userId, stamps] of this.stamps) {
      if (stamps.every((stamp) => stamp < windowStart)) {
        this.stamps.delete(userId);
      }
    }
  }
}

async function consumeRedisBucket(
  redis: BulkBroadcastRateLimiterRedis,
  actorUserId: string,
  limitPerMinute: number,
  now: number,
): Promise<boolean> {
  const bucket = Math.floor(now / bulkBroadcastRateLimitWindowMs);
  const key = `bulk-broadcast-rate:${actorUserId}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, bulkBroadcastRateLimitWindowMs);
  }
  return count <= limitPerMinute;
}

export const bulkBroadcastRateLimiter = new BulkBroadcastRateLimiter();
