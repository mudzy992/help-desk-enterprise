import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import {
  bumpGroupUnreadEpoch,
  invalidateUnreadCountCache,
  readUnreadCountFromCache,
  readUnreadCountWithEpochs,
  writeUnreadCountToCache,
  writeUnreadCountWithEpochs,
  type GroupEpochs,
  type UnreadCountCacheClient,
} from './unread-count-cache';

/**
 * The Redis client of `GET /notifications/unread-count`, wrapped so the reader
 * never has to think about Redis being down: every method degrades to "no
 * cache", and the caller falls back to the database (plan §1.3).
 *
 * The connection is opened lazily (the client is created with `lazyConnect`),
 * which is why the status is checked here rather than in the functions.
 */
@Injectable()
export class NotificationUnreadCountCache {
  constructor(@Inject(redisTokens.client) private readonly redis: Redis) {}

  async read(userId: string): Promise<number | null> {
    return readUnreadCountFromCache(await this.client(), userId);
  }

  async write(userId: string, unreadCount: number): Promise<void> {
    await writeUnreadCountToCache(await this.client(), userId, unreadCount);
  }

  /** Option A: badge + epochs of the user's groups in one round trip. */
  async readWithEpochs(
    userId: string,
    groupIds: readonly string[],
  ): Promise<{ readonly count: number | null; readonly epochs: GroupEpochs | null }> {
    return readUnreadCountWithEpochs(await this.client(), userId, groupIds);
  }

  async writeWithEpochs(
    userId: string,
    unreadCount: number,
    epochs: GroupEpochs | null,
  ): Promise<void> {
    await writeUnreadCountWithEpochs(await this.client(), userId, unreadCount, epochs);
  }

  /** Option A: a new group notification — every member's cached badge becomes a miss. */
  async bumpGroup(groupId: string): Promise<void> {
    await bumpGroupUnreadEpoch(await this.client(), groupId);
  }

  async invalidate(userId: string): Promise<void> {
    await invalidateUnreadCountCache(await this.client(), userId);
  }

  private async client(): Promise<UnreadCountCacheClient | null> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis as unknown as UnreadCountCacheClient;
    } catch {
      return null;
    }
  }
}
