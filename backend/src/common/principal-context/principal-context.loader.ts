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
import { memoizeRequestPromise } from '../request-context/request-context.storage';
import type {
  PrincipalAuthoritySnapshot,
  PrincipalContext,
} from './principal-context.types';

// All instances of this loader answer the same per-request question. A shared
// namespace lets guards and services deduplicate even if Nest resolves the
// loader from different module contexts.
const requestMemoNamespace = Object.freeze({});

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
    const cached = await readCachedPrincipalContext(client, id);
    if (
      cached !== null &&
      (await this.matchesDurableAuthority(id, cached, durableAuthority))
    ) {
      return cached;
    }
    const fresh = await loadPrincipalContext(this.prisma, id);
    if (fresh !== null) {
      await writeCachedPrincipalContext(client, fresh);
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
