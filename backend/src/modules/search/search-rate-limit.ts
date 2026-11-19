import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  loadSearchRateLimitConfiguration,
  type SearchRateLimitConfiguration,
} from './search-rate-limit.configuration';

export const searchRateLimitTokens = {
  configuration: Symbol('SearchRateLimitConfiguration'),
} as const;

/**
 * A counter of hits per key inside a window. The store is deliberately the only
 * thing that is distributed: the policy (how many, which buckets, what happens
 * on a hit) lives in `SearchRateLimiter` and is unit tested without Redis.
 */
export type SearchRateLimitStore = {
  hit(key: string, windowSeconds: number): Promise<number>;
};

/**
 * Keys are pseudonymous: an address or a user id never appears in a Redis key
 * (a `KEYS *` dump, a slow-log line or a monitor stream must not turn into a
 * directory of client addresses). The same digest rule is used for both, with a
 * namespace so the two bucket families cannot collide.
 */
export function searchRateLimitDigest(value: string): string {
  return createHash('sha256')
    .update('help-desk-enterprise:search-rate-limit:v1\0')
    .update(value.trim() || 'unknown')
    .digest('hex');
}

export function searchActorRateLimitKey(actorUserId: string): string {
  return `search:rate:actor:v1:${searchRateLimitDigest(actorUserId)}`;
}

export function searchIpRateLimitKey(ip: string | undefined): string {
  return `search:rate:ip:v1:${searchRateLimitDigest((ip ?? 'unknown').toLowerCase())}`;
}

/** Fixed window, per process: used by tests and as the degraded fallback. */
export function createMemorySearchRateLimitStore(
  now: () => number = Date.now,
): SearchRateLimitStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  return {
    hit: async (key, windowSeconds) => {
      const timestamp = now();
      const current = entries.get(key);
      if (current === undefined || current.expiresAt <= timestamp) {
        // Same guard as the branding limiter: one map must not grow unbounded.
        if (entries.size > 10_000) {
          entries.clear();
        }
        entries.set(key, {
          count: 1,
          expiresAt: timestamp + windowSeconds * 1_000,
        });
        return 1;
      }
      current.count += 1;
      return current.count;
    },
  };
}

/**
 * Atomic fixed window: `INCR` and `EXPIRE` run in one script, so a replica that
 * dies between the two calls cannot leave a key without an expiry (the failure
 * mode that turns a rate limit into a permanent lock-out).
 */
export function createRedisSearchRateLimitStore(redis: Redis): SearchRateLimitStore {
  const incrementWithExpiry =
    "local count = redis.call('INCR', KEYS[1]); " +
    "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; " +
    'return count';
  return {
    hit: async (key, windowSeconds) =>
      Number(
        await redis.eval(incrementWithExpiry, 1, key, String(windowSeconds)),
      ),
  };
}

export function createTooManySearchRequestsException(
  retryAfterSeconds: number,
): HttpException {
  return new HttpException(
    {
      code: 'TOO_MANY_SEARCH_REQUESTS',
      message: 'Too many search requests, try again later',
      details: { retryAfterSeconds },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Fail-closed answer when the budget cannot be evaluated at all: without a
 * verdict the endpoint would be an unbounded enumeration surface, so it refuses
 * instead of guessing "allowed". `503` (not `429`) tells the client that this is
 * an availability problem, and `Retry-After` keeps retries polite.
 */
export function createSearchRateLimitUnavailableException(): HttpException {
  return new HttpException(
    {
      code: 'SEARCH_RATE_LIMIT_UNAVAILABLE',
      message: 'Search is temporarily unavailable',
      details: { retryAfterSeconds: 30 },
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

/**
 * W7.59 (BA-search-05): two distributed buckets per request — the actor and the
 * client address.
 *
 * - **actor**: the subject of the session. This is what stops a signed-in script
 *   from enumerating the directory, article titles or ticket titles; the same
 *   person cannot get a bigger budget by opening a second tab.
 * - **address**: the source (`request.ip`, already resolved through
 *   `TRUST_PROXY`). It covers many sessions from one host and keeps the
 *   aggregate bounded when accounts are cheap to create.
 *
 * Both are checked before any group runs, so a denied request costs no database
 * work. Redis makes the budget shared by all API replicas; when Redis is
 * unavailable the limiter keeps enforcing the **same numbers per instance**
 * (degraded but bounded — never fail-open), and only if the counter cannot be
 * read at all does it refuse the request (`503`).
 */
@Injectable()
export class SearchRateLimiter {
  private readonly logger = new Logger(SearchRateLimiter.name);
  private readonly memoryStore = createMemorySearchRateLimitStore();
  private readonly redisStore: SearchRateLimitStore | null;
  private readonly configuration: SearchRateLimitConfiguration;
  /**
   * A Redis outage outlives thousands of requests; one warning line per window
   * keeps the log readable (and the rule "log what an operator can act on") while
   * the degradation itself stays continuous.
   */
  private lastStoreWarningAt = 0;

  constructor(
    @Optional() @Inject(redisTokens.client) redis?: Redis,
    @Optional()
    @Inject(searchRateLimitTokens.configuration)
    configuration?: SearchRateLimitConfiguration,
  ) {
    this.redisStore =
      redis === undefined || redis === null
        ? null
        : createRedisSearchRateLimitStore(redis);
    this.configuration =
      configuration ?? loadSearchRateLimitConfiguration();
  }

  async enforce(input: {
    readonly actorUserId: string;
    readonly ip?: string | undefined;
  }): Promise<void> {
    const configuration = this.configuration;
    if (!configuration.enabled) {
      return;
    }
    const [actorCount, ipCount] = await Promise.all([
      this.hit(searchActorRateLimitKey(input.actorUserId), configuration),
      this.hit(searchIpRateLimitKey(input.ip), configuration),
    ]);
    if (
      actorCount > configuration.actorRequestsPerWindow ||
      ipCount > configuration.ipRequestsPerWindow
    ) {
      throw createTooManySearchRequestsException(configuration.windowSeconds);
    }
  }

  private async hit(
    key: string,
    configuration: SearchRateLimitConfiguration,
  ): Promise<number> {
    if (this.redisStore !== null) {
      try {
        return await this.redisStore.hit(key, configuration.windowSeconds);
      } catch (error) {
        this.warnOncePerWindow(key, error, configuration.windowSeconds);
      }
    }
    try {
      return await this.memoryStore.hit(key, configuration.windowSeconds);
    } catch {
      throw createSearchRateLimitUnavailableException();
    }
  }

  private warnOncePerWindow(
    key: string,
    error: unknown,
    windowSeconds: number,
  ): void {
    const now = Date.now();
    if (now - this.lastStoreWarningAt < windowSeconds * 1_000) {
      return;
    }
    this.lastStoreWarningAt = now;
    // Name only, never the key (it is pseudonymous, but the rule is the same as
    // everywhere else in this module: do not log what you do not need).
    this.logger.warn(
      `search_rate_limit_store=degraded bucket=${key.split(':')[2] ?? 'unknown'} error=${errorName(error)}`,
    );
  }
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}
