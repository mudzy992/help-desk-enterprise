import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { redisTokens } from '../redis/redis.tokens';
import {
  invalidateCachedPrincipalContext,
  type PrincipalContextCacheClient,
} from './principal-context.cache';

/**
 * Invalidates the cached authorization data of one user (plan §2.2).
 *
 * Two steps, in this order:
 *
 * 1. `User.authzVersion` is incremented — this is what makes the change final.
 *    The cache key carries the version, so every payload written before the
 *    mutation belongs to a version nobody asks for any more.
 * 2. The pointer is moved to the new version (a tombstone: no payload exists
 *    for it), so the next request is a guaranteed miss and reloads from the
 *    database.
 *
 * Both steps are best effort and neither throws: a mutation must not fail
 * because its cache could not be told about it (rule 2.2.5). If the bump fails
 * the pointer is deleted instead, and if Redis is unreachable the next request
 * fails open into a database read anyway.
 */
@Injectable()
export class PrincipalContextInvalidator {
  private readonly logger = new Logger(PrincipalContextInvalidator.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(redisTokens.client) private readonly redis: Redis,
  ) {}

  async invalidateUser(userId: string): Promise<number | null> {
    const id = userId.trim();
    if (id.length === 0) {
      return null;
    }
    let version: number | null = null;
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { authzVersion: { increment: 1 } },
        select: { authzVersion: true },
      });
      version = updated.authzVersion;
    } catch (error) {
      // A user that no longer exists has nothing to invalidate; anything else is
      // worth a log line but must not fail the mutation that triggered it.
      this.logger.warn(
        `authz_version_bump_skipped user=${id} reason=${describeError(error)}`,
      );
    }
    await invalidateCachedPrincipalContext(await this.cacheClient(), id, version);
    return version;
  }

  /**
   * Same contract for many users, with two database round trips instead of two
   * per user: one `updateMany` to bump every version, one read to learn the new
   * versions, then one tombstone per pointer (Redis is cheap and pipelined by
   * the driver). Used by role permission edits, which affect every holder.
   */
  async invalidateUsers(userIds: readonly string[]): Promise<void> {
    const ids = [...new Set(userIds.map((userId) => userId.trim()))].filter(
      (userId) => userId.length > 0,
    );
    if (ids.length === 0) {
      return;
    }
    try {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { authzVersion: { increment: 1 } },
      });
      const versions = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, authzVersion: true },
      });
      const client = await this.cacheClient();
      const versionById = new Map(
        versions.map((row) => [row.id, row.authzVersion]),
      );
      for (const id of ids) {
        const version = versionById.get(id);
        if (version === undefined) {
          // The user disappeared meanwhile; drop whatever is cached for it.
          await invalidateCachedPrincipalContext(client, id, null);
          continue;
        }
        await invalidateCachedPrincipalContext(client, id, version);
      }
    } catch (error) {
      this.logger.warn(
        `authz_batch_invalidation_skipped users=${ids.length} reason=${describeError(error)}`,
      );
      // Fall back to the single-user path so the quiet failure of the batch does
      // not turn into a stale grant.
      for (const id of ids) {
        await this.invalidateUser(id);
      }
    }
  }

  /** Every holder of a role whose permissions changed (plan §2.2). */
  async invalidateRoleHolders(roleId: string): Promise<number> {
    const id = roleId.trim();
    if (id.length === 0) {
      return 0;
    }
    try {
      const holders = await this.prisma.userRole.findMany({
        where: { roleId: id },
        select: { userId: true },
        distinct: ['userId'],
      });
      await this.invalidateUsers(holders.map((holder) => holder.userId));
      return holders.length;
    } catch (error) {
      this.logger.warn(
        `authz_role_invalidation_skipped role=${id} reason=${describeError(error)}`,
      );
      return 0;
    }
  }

  private async cacheClient(): Promise<PrincipalContextCacheClient | null> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis as unknown as PrincipalContextCacheClient;
    } catch {
      return null;
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
