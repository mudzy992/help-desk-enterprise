import {
  BulkBroadcastRateLimiter,
  bulkBroadcastRateLimitWindowMs,
  type BulkBroadcastRateLimiterRedis,
} from './bulk-broadcast-rate-limiter';

function createRedis(overrides: Partial<BulkBroadcastRateLimiterRedis> = {}) {
  const counts = new Map<string, number>();
  const redis: BulkBroadcastRateLimiterRedis = {
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    pexpire: jest.fn(async () => 1),
    ...overrides,
  };
  return { redis, counts };
}

describe('BulkBroadcastRateLimiter (Val 3, M8/B2)', () => {
  const now = Date.parse('2026-10-04T10:00:00.000Z');

  it('counts in Redis with a one-minute TTL, so every instance shares the limit', async () => {
    const { redis } = createRedis();
    const limiter = new BulkBroadcastRateLimiter();
    limiter.attachRedis(redis);

    for (let i = 0; i < 10; i += 1) {
      await expect(limiter.consume('user-1', 10, now)).resolves.toBe(true);
    }
    await expect(limiter.consume('user-1', 10, now)).resolves.toBe(false);
    // The TTL is set once, on the first increment of the bucket.
    expect(redis.pexpire).toHaveBeenCalledTimes(1);
    expect(redis.pexpire).toHaveBeenCalledWith(
      expect.stringContaining('bulk-broadcast-rate:user-1:'),
      bulkBroadcastRateLimitWindowMs,
    );
    // Another user gets their own bucket.
    await expect(limiter.consume('user-2', 10, now)).resolves.toBe(true);
    // Next minute is a fresh bucket.
    await expect(
      limiter.consume('user-1', 10, now + bulkBroadcastRateLimitWindowMs),
    ).resolves.toBe(true);
  });

  it('falls back to the in-memory window when Redis rejects the command', async () => {
    const { redis } = createRedis({
      incr: jest.fn(async () => {
        throw new Error('Connection is closed.');
      }),
    });
    const limiter = new BulkBroadcastRateLimiter();
    limiter.attachRedis(redis);

    for (let i = 0; i < 10; i += 1) {
      await expect(limiter.consume('user-1', 10, now)).resolves.toBe(true);
    }
    // Redis is down, but the limit still holds — fail-open means "no Redis
    // adapter", not "no limit".
    await expect(limiter.consume('user-1', 10, now)).resolves.toBe(false);
  });

  it('keeps the sliding window in memory and resets it after a minute', async () => {
    const limiter = new BulkBroadcastRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      await expect(limiter.consume('user-1', 3, now)).resolves.toBe(true);
    }
    await expect(limiter.consume('user-1', 3, now)).resolves.toBe(false);
    await expect(limiter.consume('user-2', 3, now)).resolves.toBe(true);
    await expect(
      limiter.consume('user-1', 3, now + bulkBroadcastRateLimitWindowMs + 1),
    ).resolves.toBe(true);
  });

  it('sweeps users whose window has passed instead of growing forever', async () => {
    const limiter = new BulkBroadcastRateLimiter();
    for (let i = 0; i < 50; i += 1) {
      await limiter.consume(`user-${i}`, 10, now);
    }
    const internals = limiter as unknown as { stamps: Map<string, number[]> };
    expect(internals.stamps.size).toBe(50);
    // A minute later the sweep drops every user whose whole window is in the past.
    await limiter.consume('user-fresh', 10, now + 2 * bulkBroadcastRateLimitWindowMs);
    expect(internals.stamps.size).toBe(1);
    expect(internals.stamps.has('user-fresh')).toBe(true);
  });
});
