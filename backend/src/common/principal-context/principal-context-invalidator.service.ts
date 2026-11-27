import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { redisTokens } from '../redis/redis.tokens';
import {
  invalidateCachedPrincipalContext,
  principalContextCacheTtlSeconds,
  principalContextVersionKey,
  type PrincipalContextCacheClient,
} from './principal-context.cache';
import type { RoleHolderFence } from './principal-context.types';
import {
  publishSocketSessionInvalidation,
  socketSessionInvalidationBatchSize,
} from '../security/socket-session-invalidation';

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
 * 3. A best-effort Pub/Sub invalidation disconnects this user's live sockets on
 *    every API instance. The 15-second durable socket-lease recheck is the
 *    fallback if Redis is unavailable or a message is missed.
 *
 * All steps are best effort and neither throws: a mutation must not fail because
 * its cache or socket notification could not be told about it (rule 2.2.5). If
 * the bump fails the pointer is deleted instead, and if Redis is unreachable the
 * next request falls back to a database read anyway.
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
    await this.notifyUserChanged(id, version);
    return version;
  }

  /**
   * Publish a mutation whose authzVersion was already committed atomically by
   * its caller. This avoids a second DB bump while still tombstoning the shared
   * cache pointer and revoking sockets after the transaction commits.
   */
  async notifyUserChanged(
    userId: string,
    authzVersion: number | null,
  ): Promise<void> {
    const id = userId.trim();
    if (id.length === 0) return;
    try {
      await invalidateCachedPrincipalContext(
        await this.cacheClient(),
        id,
        authzVersion,
      );
      await this.publishSocketInvalidations([id]);
    } catch (error) {
      this.logger.warn(
        `authz_notification_skipped user=${id} reason=${describeError(error)}`,
      );
    }
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
      await this.publishSocketInvalidations(ids);
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

  /**
   * W2.32 (`BA-rbac-05`): every holder of a role whose permission set changed,
   * read from the database **and** fenced by the caller's committed versions.
   * The dispatcher uses this at delivery time instead of trusting a payload: a
   * retried outbox message still invalidates whatever the database says now.
   */
  async roleHolderVersions(roleId: string): Promise<readonly RoleHolderFence[]> {
    const id = roleId.trim();
    if (id.length === 0) {
      return [];
    }
    const holders = await this.prisma.userRole.findMany({
      where: { roleId: id },
      select: { userId: true },
      distinct: ['userId'],
      orderBy: { userId: 'asc' },
    });
    const userIds = holders.map((holder) => holder.userId);
    if (userIds.length === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, authzVersion: true },
    });
    return users.map((user) => ({
      userId: user.id,
      authzVersion: user.authzVersion,
    }));
  }

  /**
   * W2.32 (`BA-rbac-05`): publishes a role-permission change whose
   * `authzVersion` bumps already committed with the write.
   *
   * Unlike `invalidateRoleHolders` this method **throws** when the cache cannot
   * be told about the change, so the caller that owns the durable retry (the
   * outbox dispatcher) can try again instead of claiming success. Correctness
   * does not depend on it: the committed version already makes every older
   * payload unreachable through the loader's database fence.
   */
  async publishCommittedRoleHolders(
    roleId: string,
    holders: readonly RoleHolderFence[],
  ): Promise<number> {
    const byUserId = new Map(
      holders.map((holder) => [holder.userId.trim(), holder.authzVersion]),
    );
    const userIds = [...byUserId.keys()].filter((userId) => userId.length > 0);
    if (userIds.length === 0) {
      return 0;
    }
    const client = await this.requireCacheClient();
    for (const userId of userIds) {
      await tombstoneStrict(client, userId, byUserId.get(userId) ?? null);
    }
    await this.publishSocketInvalidations(userIds);
    return userIds.length;
  }

  /** Like `cacheClient`, but an unreachable Redis is an error, not a miss. */
  private async requireCacheClient(): Promise<PrincipalContextCacheClient> {
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }
    if (this.redis.status !== 'ready') {
      throw new Error(`redis_${this.redis.status}`);
    }
    return this.redis as unknown as PrincipalContextCacheClient;
  }

  private async publishSocketInvalidations(
    subjectIds: readonly string[],
  ): Promise<void> {
    if (typeof this.redis.publish !== 'function') {
      return;
    }
    for (
      let offset = 0;
      offset < subjectIds.length;
      offset += socketSessionInvalidationBatchSize
    ) {
      const published = await publishSocketSessionInvalidation(this.redis, {
        version: 1,
        kind: 'users',
        subjectIds: subjectIds.slice(
          offset,
          offset + socketSessionInvalidationBatchSize,
        ),
      });
      if (!published && this.redis.status === 'ready') {
        this.logger.warn('socket_authz_invalidation_publish_unavailable');
      }
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

/**
 * The pointer write of `invalidateCachedPrincipalContext`, without the swallow:
 * the durable retry path has to see a failed tombstone.
 */
async function tombstoneStrict(
  client: PrincipalContextCacheClient,
  userId: string,
  version: number | null,
): Promise<void> {
  const key = principalContextVersionKey(userId);
  if (version === null) {
    await client.del(key);
    return;
  }
  await client.set(key, String(version), 'EX', principalContextCacheTtlSeconds);
}
