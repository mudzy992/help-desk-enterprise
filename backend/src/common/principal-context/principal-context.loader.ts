import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { redisTokens } from '../redis/redis.tokens';
import {
  readCachedPrincipalContext,
  writeCachedPrincipalContext,
  type PrincipalContextCacheClient,
} from './principal-context.cache';
import { loadPrincipalContext } from './load-principal-context';
import {
  getRequestId,
  memoizeRequestPromise,
} from '../request-context/request-context.storage';
import { recordDbQueryTraceLabel } from '../database/db-query-counter';
import type {
  PrincipalAuthoritySnapshot,
  PrincipalContext,
} from './principal-context.types';

// All instances of this loader answer the same per-request question. A shared
// namespace lets guards and services deduplicate even if Nest resolves the
// loader from different module contexts.
const requestMemoNamespace = Object.freeze({});
const principalContextLoadsInFlight = new WeakMap<
  PrismaService,
  Map<string, Promise<PrincipalContext | null>>
>();

function loadPrincipalContextSingleFlight(
  prisma: PrismaService,
  userId: string,
  durableAuthority?: PrincipalAuthoritySnapshot,
): Promise<PrincipalContext | null> {
  let inFlightByAuthority = principalContextLoadsInFlight.get(prisma);
  if (inFlightByAuthority === undefined) {
    inFlightByAuthority = new Map();
    principalContextLoadsInFlight.set(prisma, inFlightByAuthority);
  }

  const expectedVersion =
    durableAuthority?.subjectId === userId
      ? durableAuthority.authzVersion
      : 'unfenced';
  const key = `${userId}\u0000${expectedVersion}`;
  const existing = inFlightByAuthority.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const pending = loadPrincipalContext(prisma, userId).finally(() => {
    if (inFlightByAuthority?.get(key) === pending) {
      inFlightByAuthority.delete(key);
    }
  });
  inFlightByAuthority.set(key, pending);
  return pending;
}

/**
 * The one place that reads authorization data (plan §2.2).
 *
 * Order: Redis → database → fill Redis. A Redis failure is a warn and a
 * database read (fail-open, rule 4): authorization is never denied because a
 * cache is down, and it is never skipped because a cache is warm — the payload
 * is only served while its version still matches `User.authzVersion`.
 */
@Injectable()
export class PrincipalContextLoader {
  private readonly logger = new Logger(PrincipalContextLoader.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(redisTokens.client) private readonly redis: Redis,
  ) {}

  load(
    subjectId: string,
    durableAuthority?: PrincipalAuthoritySnapshot,
  ): Promise<PrincipalContext | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return Promise.resolve(null);
    }
    if (
      durableAuthority?.subjectId === id &&
      (!durableAuthority.isActive || durableAuthority.mustChangePassword)
    ) {
      return Promise.resolve(null);
    }
    // SessionAuthenticationGuard may supply authority read in the same durable
    // session query. Otherwise cache hits still perform the independent DB fence.
    // RoleGuard and services share this request-bound result.
    return memoizeRequestPromise(requestMemoNamespace, id, () =>
      this.loadFromCache(id, durableAuthority),
    );
  }

  private async loadFromCache(
    id: string,
    durableAuthority?: PrincipalAuthoritySnapshot,
  ): Promise<PrincipalContext | null> {
    const client = await this.cacheClient();
    const cached = await readCachedPrincipalContext(client, id, (reason) =>
      tracePrincipalContextCache(`redis_miss_${reason}`),
    );
    if (cached !== null) {
      const authorityMatches = await this.matchesDurableAuthority(
        id,
        cached,
        durableAuthority,
      );
      tracePrincipalContextCache(
        durableAuthority === undefined
          ? authorityMatches
            ? 'redis_hit_database_fence'
            : 'redis_hit_stale_database_fence'
          : authorityMatches
            ? 'redis_hit_session_fence'
            : 'redis_hit_stale_session_fence',
      );
      if (authorityMatches) {
        return cached;
      }
    }
    tracePrincipalContextCache('full_database_load');
    const fresh = await loadPrincipalContextSingleFlight(
      this.prisma,
      id,
      durableAuthority,
    );
    if (fresh !== null) {
      await writeCachedPrincipalContext(client, fresh, () =>
        tracePrincipalContextCache('redis_write_error'),
      );
    }
    return fresh;
  }

  /**
   * Redis is only a payload cache, never the revocation authority. Every cache
   * hit is fenced by fresh PostgreSQL user state. A session guard can provide
   * the same state from its joined, durable session read; legacy/no-session
   * callers perform the user read here. An unavailable authority fails closed.
   */
  private async matchesDurableAuthority(
    subjectId: string,
    cached: PrincipalContext,
    durableAuthority?: PrincipalAuthoritySnapshot,
  ): Promise<boolean> {
    if (durableAuthority?.subjectId === subjectId) {
      return (
        durableAuthority.isActive &&
        !durableAuthority.mustChangePassword &&
        durableAuthority.authzVersion === cached.authzVersion &&
        cached.isActive &&
        !cached.mustChangePassword
      );
    }
    try {
      const authority = await this.prisma.user.findUnique({
        where: { id: subjectId },
        select: {
          authzVersion: true,
          isActive: true,
          mustChangePassword: true,
        },
      });
      return (
        authority !== null &&
        authority.isActive &&
        !authority.mustChangePassword &&
        authority.authzVersion === cached.authzVersion &&
        cached.isActive &&
        !cached.mustChangePassword
      );
    } catch (error) {
      this.logger.error(
        `authz_authority_unavailable user=${subjectId} decision=deny reason=${describeError(error)}`,
      );
      return false;
    }
  }

  private async cacheClient(): Promise<PrincipalContextCacheClient | null> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis as unknown as PrincipalContextCacheClient;
    } catch (error) {
      this.logger.warn(
        `authz_cache_unavailable fallback=database reason=${describeError(error)}`,
      );
      return null;
    }
  }
}

function tracePrincipalContextCache(outcome: string): void {
  if (process.env.DB_QUERY_TRACE === 'true') {
    recordDbQueryTraceLabel(
      getRequestId(),
      `principal_context_cache=${outcome}`,
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
