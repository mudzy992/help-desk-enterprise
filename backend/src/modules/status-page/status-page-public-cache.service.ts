import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';

/**
 * Paket 2.7 (§8.4): shared public status page cache.
 *
 * Replaces the per-process `this.cached` Map in `PublicStatusPageController`
 * with a Redis-backed cache shared by every API instance. A cache version key
 * is incremented on every incident mutation (create/edit/resolve/link/unlink),
 * so all instances invalidate at once instead of waiting up to 30 s for TTL.
 *
 * Redis is optional: when it is unavailable the controller degrades to no
 * shared cache (each instance recomputes from the database) and rate limiting
 * fails closed instead of failing open.
 */
@Injectable()
export class StatusPagePublicCacheService {
  private static readonly versionKey = 'status:public:cache:version';
  private static readonly pageKey = 'status:public:page';
  private static readonly pageTtlSeconds = 30;

  constructor(
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
  ) {}

  get enabled(): boolean {
    return this.redis !== undefined;
  }

  /** Current cache version. Every bump invalidates every instance's page cache. */
  async getVersion(): Promise<number> {
    const client = await this.client();
    if (client === null) return 0;
    try {
      const raw = await client.get(StatusPagePublicCacheService.versionKey);
      const parsed = Number.parseInt(raw ?? '0', 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  /** Bump the cache version so all instances stop serving stale pages. */
  async bumpVersion(): Promise<void> {
    const client = await this.client();
    if (client === null) return;
    try {
      await client.incr(StatusPagePublicCacheService.versionKey);
    } catch {
      // Best effort: instances will self-heal within the page TTL.
    }
  }

  async getPage(version: number): Promise<string | null> {
    const client = await this.client();
    if (client === null) return null;
    try {
      return await client.get(`${StatusPagePublicCacheService.pageKey}:v${version}`);
    } catch {
      return null;
    }
  }

  async setPage(version: number, body: string): Promise<void> {
    const client = await this.client();
    if (client === null) return;
    try {
      await client.set(
        `${StatusPagePublicCacheService.pageKey}:v${version}`,
        body,
        'EX',
        StatusPagePublicCacheService.pageTtlSeconds,
      );
    } catch {
      // The database stays the source of truth.
    }
  }

  private async client(): Promise<Redis | null> {
    if (this.redis === undefined) return null;
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis;
    } catch {
      return null;
    }
  }
}
