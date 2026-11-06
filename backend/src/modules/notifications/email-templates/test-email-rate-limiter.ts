/**
 * The 5 test e-mails per 10 minutes are counted in shared Redis so the
 * notifications editor and install wizard share one limit across API instances.
 * Test sends fail closed when Redis is missing or unavailable; there is no
 * process-local fallback that a restart, another endpoint, or another instance
 * could bypass.
 */
export const testEmailSendLimit = 5;
export const testEmailSendWindowMs = 10 * 60_000;

/** The slice of ioredis this limiter needs; the shared client satisfies it. */
export type TestEmailRateLimiterRedis = {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    windowMilliseconds: string,
  ): Promise<unknown>;
};

export class TestEmailRateLimiterUnavailableError extends Error {
  constructor() {
    super('Shared test-email rate limiter is unavailable');
    this.name = 'TestEmailRateLimiterUnavailableError';
  }
}

const incrementWithExpiry = [
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl == -2 then redis.call('SET', KEYS[1], '0', 'PX', ARGV[1]) end",
  "if ttl == -1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local count = redis.call('INCR', KEYS[1])",
  'return count',
].join('; ');

export function testEmailRateLimiterKey(actorKey: string, now: number): string {
  const bucket = Math.floor(now / testEmailSendWindowMs);
  return `test-email-rate:${actorKey}:${bucket}`;
}

export class TestEmailRateLimiter {
  constructor(private readonly redis: TestEmailRateLimiterRedis | null = null) {}

  /** `true` = the send is allowed and has been counted. */
  async consume(actorKey: string, now: number = Date.now()): Promise<boolean> {
    if (this.redis === null) {
      throw new TestEmailRateLimiterUnavailableError();
    }

    const key = testEmailRateLimiterKey(actorKey, now);
    let count: number;
    try {
      count = Number(
        await this.redis.eval(
          incrementWithExpiry,
          1,
          key,
          String(testEmailSendWindowMs),
        ),
      );
    } catch {
      throw new TestEmailRateLimiterUnavailableError();
    }

    if (!Number.isSafeInteger(count) || count < 1) {
      throw new TestEmailRateLimiterUnavailableError();
    }
    return count <= testEmailSendLimit;
  }
}
