import {
  TestEmailRateLimiter,
  testEmailSendLimit,
  testEmailSendWindowMs,
  type TestEmailRateLimiterRedis,
} from './test-email-rate-limiter';

function createRedis(overrides: Partial<TestEmailRateLimiterRedis> = {}) {
  const counts = new Map<string, number>();
  const redis: TestEmailRateLimiterRedis = {
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

describe('TestEmailRateLimiter (Val 3, M12/B4)', () => {
  const now = Date.parse('2026-10-04T10:00:00.000Z');

  it('counts in Redis with a TTL, so every instance shares the limit', async () => {
    const { redis } = createRedis();
    const limiter = new TestEmailRateLimiter(redis);

    for (let i = 0; i < testEmailSendLimit; i += 1) {
      await expect(limiter.consume('admin', now)).resolves.toBe(true);
    }
    await expect(limiter.consume('admin', now)).resolves.toBe(false);
    expect(redis.pexpire).toHaveBeenCalledTimes(1);
    expect(redis.pexpire).toHaveBeenCalledWith(
      expect.stringContaining('test-email-rate:admin:'),
      testEmailSendWindowMs,
    );
    // Another admin has their own window, and the next window starts fresh.
    await expect(limiter.consume('other-admin', now)).resolves.toBe(true);
    await expect(
      limiter.consume('admin', now + testEmailSendWindowMs),
    ).resolves.toBe(true);
  });

  it('keeps enforcing locally when Redis rejects the command', async () => {
    const { redis } = createRedis({
      incr: jest.fn(async () => {
        throw new Error('Connection is closed.');
      }),
    });
    const limiter = new TestEmailRateLimiter(redis);

    for (let i = 0; i < testEmailSendLimit; i += 1) {
      await expect(limiter.consume('admin', now)).resolves.toBe(true);
    }
    await expect(limiter.consume('admin', now)).resolves.toBe(false);
  });

  it('keeps the sliding window in memory and sweeps stale admins', async () => {
    const limiter = new TestEmailRateLimiter();
    for (let i = 0; i < testEmailSendLimit; i += 1) {
      await expect(limiter.consume('admin', now)).resolves.toBe(true);
    }
    await expect(limiter.consume('admin', now)).resolves.toBe(false);
    await expect(
      limiter.consume('admin', now + testEmailSendWindowMs + 1),
    ).resolves.toBe(true);

    const internals = limiter as unknown as { stamps: Map<string, number[]> };
    await limiter.consume('fresh-admin', now + 3 * testEmailSendWindowMs);
    expect(internals.stamps.size).toBe(1);
    expect(internals.stamps.has('fresh-admin')).toBe(true);
    expect(internals.stamps.has('admin')).toBe(false);
  });
});
