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
import type { PrincipalContext } from './principal-context.types';

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

  async load(subjectId: string): Promise<PrincipalContext | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return null;
    }
    const client = await this.cacheClient();
    const cached = await readCachedPrincipalContext(client, id);
    if (cached !== null) {
      return cached;
    }
    const fresh = await loadPrincipalContext(this.prisma, id);
    if (fresh !== null) {
      await writeCachedPrincipalContext(client, fresh);
    }
    return fresh;
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
