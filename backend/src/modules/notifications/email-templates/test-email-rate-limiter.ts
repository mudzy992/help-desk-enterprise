/**
 * Val 3 (M12/B4): the "5 test e-mails per 10 minutes" limit lived in a `Map`
 * field of the service, so a restart reset it and every API instance kept its own
 * counter — with N instances the real limit was N × 5. The limit now lives in
 * Redis (one bucket per admin per window, `INCR` + `PEXPIRE`, so the key expires
 * by itself and every instance shares one counter), with the old in-memory
 * window as the fallback when Redis is unreachable — no test send is ever let
 * through just because Redis is down.
 */
export const testEmailSendLimit = 5;
export const testEmailSendWindowMs = 10 * 60_000;
const inMemorySweepIntervalMs = 60_000;

/** The slice of ioredis this limiter needs; the shared client satisfies it. */
export type TestEmailRateLimiterRedis = {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<unknown>;
};

export class TestEmailRateLimiter {
  private readonly stamps = new Map<string, number[]>();
  private lastSweepAt = 0;

  constructor(private readonly redis: TestEmailRateLimiterRedis | null = null) {}

  /** `true` = the send is allowed and has been counted. */
  async consume(actorKey: string, now: number = Date.now()): Promise<boolean> {
    if (this.redis !== null) {
      try {
        return await consumeRedisBucket(this.redis, actorKey, now);
      } catch {
        // Redis refused the command: keep enforcing locally.
      }
    }
    return this.consumeInMemory(actorKey, now);
  }

  private consumeInMemory(actorKey: string, now: number): boolean {
    this.sweepInMemory(now);
    const windowStart = now - testEmailSendWindowMs;
    const recent = (this.stamps.get(actorKey) ?? []).filter(
      (stamp) => stamp >= windowStart,
    );
    if (recent.length >= testEmailSendLimit) {
      this.stamps.set(actorKey, recent);
      return false;
    }
    recent.push(now);
    this.stamps.set(actorKey, recent);
    return true;
  }

  private sweepInMemory(now: number): void {
    if (now - this.lastSweepAt < inMemorySweepIntervalMs) {
      return;
    }
    this.lastSweepAt = now;
    const windowStart = now - testEmailSendWindowMs;
    for (const [actorKey, stamps] of this.stamps) {
      if (stamps.every((stamp) => stamp < windowStart)) {
        this.stamps.delete(actorKey);
      }
    }
  }
}

async function consumeRedisBucket(
  redis: TestEmailRateLimiterRedis,
  actorKey: string,
  now: number,
): Promise<boolean> {
  const bucket = Math.floor(now / testEmailSendWindowMs);
  const key = `test-email-rate:${actorKey}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, testEmailSendWindowMs);
  }
  return count <= testEmailSendLimit;
}
