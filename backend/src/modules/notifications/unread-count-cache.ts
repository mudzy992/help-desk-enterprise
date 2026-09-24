import {
  unreadCountCacheKeyPrefix,
  unreadCountCacheTtlSeconds,
} from './unread-count-cache.constants';

/**
 * The slice of the Redis client this cache needs. Keeping it this narrow lets
 * the cache be driven by a fake in tests and by Redis in production, and it
 * makes the "Redis is not there" case explicit (a `null` client).
 */
export interface UnreadCountCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export function unreadCountCacheKey(userId: string): string {
  return `${unreadCountCacheKeyPrefix}:${userId}`;
}

/**
 * Reads the cached badge.
 *
 * Every failure is a miss: a broken cache may cost a query, never an error. A
 * value that is not a number is treated the same way (something else wrote the
 * key), and nothing is thrown.
 */
export async function readUnreadCountFromCache(
  client: UnreadCountCacheClient | null,
  userId: string,
): Promise<number | null> {
  if (client === null) {
    return null;
  }
  try {
    const cached = await client.get(unreadCountCacheKey(userId));
    if (cached === null) {
      return null;
    }
    const parsed = Number.parseInt(cached, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeUnreadCountToCache(
  client: UnreadCountCacheClient | null,
  userId: string,
  unreadCount: number,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    await client.set(
      unreadCountCacheKey(userId),
      String(unreadCount),
      'EX',
      unreadCountCacheTtlSeconds,
    );
  } catch {
    // The database remains the source of truth; a failed write only means the
    // next read queries it again.
  }
}

/** Drops the entry so the next read recomputes it (mark read, new fan-out). */
export async function invalidateUnreadCountCache(
  client: UnreadCountCacheClient | null,
  userId: string,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    await client.del(unreadCountCacheKey(userId));
  } catch {
    // Same as above: a stale entry expires on its own within the TTL.
  }
}
