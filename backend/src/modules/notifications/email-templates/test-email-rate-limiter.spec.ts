import {
  TestEmailRateLimiter,
  TestEmailRateLimiterUnavailableError,
  testEmailRateLimiterKey,
  testEmailSendLimit,
  testEmailSendWindowMs,
  type TestEmailRateLimiterRedis,
} from './test-email-rate-limiter';

function createRedis(overrides: Partial<TestEmailRateLimiterRedis> = {}) {
  const counts = new Map<string, number>();
  const expirations = new Map<string, number>();
  const evalMock = jest.fn(
    async (
      script: string,
      numberOfKeys: number,
      key: string,
      windowMilliseconds: string,
    ) => {
      expect(numberOfKeys).toBe(1);
      expect(script).toContain("redis.call('INCR', KEYS[1])");
      expect(script).toContain("redis.call('SET', KEYS[1], '0', 'PX', ARGV[1])");
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next === 1) expirations.set(key, Number(windowMilliseconds));
      return next;
    },
  );
  const redis: TestEmailRateLimiterRedis = {
    eval: evalMock,
    ...overrides,
  };
  return { redis, counts, expirations, evalMock };
}

describe('TestEmailRateLimiter (BA-notifications-13)', () => {
  const now = Date.parse('2026-10-04T10:00:00.000Z');

  it('shares one atomic Redis window across independent limiter instances', async () => {
    const { redis, counts, expirations, evalMock } = createRedis();
    const firstInstance = new TestEmailRateLimiter(redis);
    const secondInstance = new TestEmailRateLimiter(redis);

    const results = await Promise.all(
      Array.from({ length: testEmailSendLimit + 2 }, (_, index) =>
        (index % 2 === 0 ? firstInstance : secondInstance).consume('admin', now),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(testEmailSendLimit);
    expect(results.filter((allowed) => !allowed)).toHaveLength(2);
    const firstWindowKey = testEmailRateLimiterKey('admin', now);
    expect(counts.get(firstWindowKey)).toBe(testEmailSendLimit + 2);
    expect(expirations.get(firstWindowKey)).toBe(testEmailSendWindowMs);
    expect(evalMock).toHaveBeenCalledTimes(testEmailSendLimit + 2);
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('PTTL'),
      1,
      firstWindowKey,
      String(testEmailSendWindowMs),
    );

    await expect(firstInstance.consume('other-admin', now)).resolves.toBe(true);
    await expect(
      secondInstance.consume('admin', now + testEmailSendWindowMs),
    ).resolves.toBe(true);
    expect(
      testEmailRateLimiterKey('admin', now + testEmailSendWindowMs),
    ).not.toBe(firstWindowKey);
  });

  it('fails closed when the shared Redis client is missing', async () => {
    const limiter = new TestEmailRateLimiter();

    await expect(limiter.consume('admin', now)).rejects.toBeInstanceOf(
      TestEmailRateLimiterUnavailableError,
    );
  });

  it('fails closed when Redis errors or returns an invalid count', async () => {
    const unavailable = new TestEmailRateLimiter(
      createRedis({
        eval: jest.fn(async () => {
          throw new Error('connection string must not escape');
        }),
      }).redis,
    );
    await expect(unavailable.consume('admin', now)).rejects.toBeInstanceOf(
      TestEmailRateLimiterUnavailableError,
    );

    const invalidReply = new TestEmailRateLimiter(
      createRedis({ eval: jest.fn(async () => 'not-a-count') }).redis,
    );
    await expect(invalidReply.consume('admin', now)).rejects.toBeInstanceOf(
      TestEmailRateLimiterUnavailableError,
    );
  });
});
