import type { HttpException } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  createMemorySearchRateLimitStore,
  createSearchRateLimitUnavailableException,
  SearchRateLimiter,
  searchActorRateLimitKey,
  searchIpRateLimitKey,
  searchRateLimitDigest,
} from './search-rate-limit';
import {
  defaultSearchRateLimitConfiguration,
  type SearchRateLimitConfiguration,
} from './search-rate-limit.configuration';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const configuration = (
  overrides: Partial<SearchRateLimitConfiguration> = {},
): SearchRateLimitConfiguration => ({
  ...defaultSearchRateLimitConfiguration,
  windowSeconds: 60,
  actorRequestsPerWindow: 3,
  ipRequestsPerWindow: 5,
  ...overrides,
});

/** Minimal Redis double: it understands the `eval` the store sends. */
function createFakeRedis(input: { readonly fail?: boolean } = {}): {
  readonly redis: Redis;
  readonly calls: { key: string; windowSeconds: string }[];
} {
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const calls: { key: string; windowSeconds: string }[] = [];
  const redis = {
    eval: async (
      _script: string,
      _keys: number,
      key: string,
      windowSeconds: string,
    ) => {
      calls.push({ key, windowSeconds });
      if (input.fail === true) {
        throw new Error('redis down');
      }
      const now = Date.now();
      const current = counters.get(key);
      if (current === undefined || current.expiresAt <= now) {
        counters.set(key, {
          count: 1,
          expiresAt: now + Number(windowSeconds) * 1_000,
        });
        return 1;
      }
      current.count += 1;
      return current.count;
    },
  };
  return { redis: redis as unknown as Redis, calls };
}

const status = (error: unknown): number | undefined =>
  (error as HttpException | undefined)?.getStatus?.();

const body = (error: unknown): Record<string, unknown> | undefined =>
  (error as HttpException | undefined)?.getResponse?.() as
    | Record<string, unknown>
    | undefined;

describe('SearchRateLimiter (W7.59, BA-search-05)', () => {
  it('allows the budget and answers 429 with Retry-After data after it', async () => {
    const limiter = new SearchRateLimiter(undefined, configuration());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        limiter.enforce({ actorUserId: 'user-1', ip: '203.0.113.9' }),
      ).resolves.toBeUndefined();
    }

    const error = await limiter
      .enforce({ actorUserId: 'user-1', ip: '203.0.113.9' })
      .catch((caught: unknown) => caught);

    expect(status(error)).toBe(429);
    expect(body(error)).toMatchObject({
      code: 'TOO_MANY_SEARCH_REQUESTS',
      details: { retryAfterSeconds: 60 },
    });
  });

  it('counts each actor separately and keeps a shared address bucket', async () => {
    // actor budget 3, address budget 5 (see `configuration()`).
    const limiter = new SearchRateLimiter(undefined, configuration());
    const attempt = (actorUserId: string) =>
      limiter
        .enforce({ actorUserId, ip: '198.51.100.7' })
        .then(() => 'allowed' as const)
        .catch((error: unknown) => status(error));

    // The actor bucket is the tighter one: the fourth request of user-1 is over
    // it even though the address still has room (4 of 5 used).
    expect(await attempt('user-1')).toBe('allowed');
    expect(await attempt('user-1')).toBe('allowed');
    expect(await attempt('user-1')).toBe('allowed');
    expect(await attempt('user-1')).toBe(429);

    // A second actor gets the address's last free slot…
    expect(await attempt('user-2')).toBe('allowed');
    // …and then the address bucket — not the actor bucket — refuses the next one.
    expect(await attempt('user-2')).toBe(429);
    // A third actor on that address is already over the address budget: the
    // aggregate cannot be multiplied by creating accounts.
    expect(await attempt('user-3')).toBe(429);
  });

  it('needs no Redis to enforce: the in-process window is a real budget', async () => {
    const limiter = new SearchRateLimiter(undefined, configuration());
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        limiter
          .enforce({ actorUserId: 'user-3', ip: '192.0.2.1' })
          .then(() => 'allowed')
          .catch((error: unknown) => status(error)),
      ),
    );
    // Three allowed, two refused — a deterministic count, not a race.
    expect(results.filter((entry) => entry === 'allowed')).toHaveLength(3);
    expect(results.filter((entry) => entry === 429)).toHaveLength(2);
  });

  it('keeps the budget when Redis answers, and degrades to the local bucket when it does not', async () => {
    const answering = createFakeRedis();
    const shared = new SearchRateLimiter(answering.redis, configuration());
    await shared.enforce({ actorUserId: 'user-4', ip: '192.0.2.2' });
    expect(answering.calls).toHaveLength(2);
    // Pseudonymous keys: neither the address nor the id appears in Redis.
    expect(answering.calls.map((call) => call.key)).toEqual([
      searchActorRateLimitKey('user-4'),
      searchIpRateLimitKey('192.0.2.2'),
    ]);
    expect(answering.calls[0]?.key).not.toContain('user-4');
    expect(answering.calls[1]?.key).not.toContain('192.0.2.2');

    const broken = createFakeRedis({ fail: true });
    const degraded = new SearchRateLimiter(broken.redis, configuration());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        degraded.enforce({ actorUserId: 'user-5', ip: '192.0.2.3' }),
      ).resolves.toBeUndefined();
    }
    // Redis is down, but the request is still metered — the budget does not
    // fail open just because the distributed store is unavailable.
    await expect(
      degraded.enforce({ actorUserId: 'user-5', ip: '192.0.2.3' }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('refuses with 503 when the budget cannot be evaluated at all', async () => {
    const limiter = new SearchRateLimiter(undefined, configuration());
    // The in-process store is the last resort; if it fails, the endpoint must
    // not answer "allowed" (fail-closed), because that is the unbounded case.
    const memory = (
      limiter as unknown as { memoryStore: { hit: () => Promise<number> } }
    ).memoryStore;
    jest.spyOn(memory, 'hit').mockRejectedValue(new Error('store broken'));

    const error = await limiter
      .enforce({ actorUserId: 'user-6', ip: '192.0.2.4' })
      .catch((caught: unknown) => caught);
    expect(status(error)).toBe(503);
    expect(body(error)).toMatchObject({ code: 'SEARCH_RATE_LIMIT_UNAVAILABLE' });
    expect(createSearchRateLimitUnavailableException().getStatus()).toBe(503);
  });

  it('does not meter anything when the deployment disabled the budget', async () => {
    const redis = createFakeRedis();
    const limiter = new SearchRateLimiter(
      redis.redis,
      configuration({ enabled: false }),
    );
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await expect(
        limiter.enforce({ actorUserId: 'user-7', ip: '192.0.2.5' }),
      ).resolves.toBeUndefined();
    }
    expect(redis.calls).toEqual([]);
  });

  it('expires the window instead of locking the actor out forever', async () => {
    let now = 0;
    const store = createMemorySearchRateLimitStore(() => now);
    const key = 'search:rate:actor:v1:test';
    expect(await store.hit(key, 60)).toBe(1);
    expect(await store.hit(key, 60)).toBe(2);
    now = 60_000;
    // A fresh window starts: the counter is not a permanent lock.
    expect(await store.hit(key, 60)).toBe(1);
  });

  it('hashes keys so a dump cannot reveal the address or the actor', () => {
    const digest = searchRateLimitDigest('192.0.2.10');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(searchIpRateLimitKey('192.0.2.10')).toBe(`search:rate:ip:v1:${digest}`);
    expect(searchActorRateLimitKey('user-9')).not.toBe(
      searchIpRateLimitKey('user-9'),
    );
    // Case and padding of an address cannot be used to start a second bucket.
    expect(searchIpRateLimitKey(' 192.0.2.10 ')).toBe(
      searchIpRateLimitKey('192.0.2.10'),
    );
    expect(searchIpRateLimitKey(undefined)).toBe(searchIpRateLimitKey('unknown'));
  });
});
