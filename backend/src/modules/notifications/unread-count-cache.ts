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

/**
 * Option A (2026-09-24): a group notification changes the badge of every member, and
 * the fan-out no longer reads the member list — so it cannot drop N user keys. Instead
 * each group has an epoch counter; a cached badge remembers the epochs of the user's
 * groups at the time it was counted, and any bump makes it a miss.
 *
 * One `MGET` per read (user key + epochs), one `INCR` per group event. A client without
 * `mget`/`incr` (old fakes) or an empty group list falls back to the plain entry above.
 */
export interface GroupEpochCacheClient extends UnreadCountCacheClient {
  mget(...keys: string[]): Promise<(string | null)[]>;
  incr(key: string): Promise<number>;
}

export function groupUnreadEpochKey(groupId: string): string {
  return `${unreadCountCacheKeyPrefix}:group-epoch:${groupId}`;
}

export type GroupEpochs = Readonly<Record<string, string>>;

function supportsEpochs(
  client: UnreadCountCacheClient | null,
): client is GroupEpochCacheClient {
  return (
    client !== null &&
    typeof (client as Partial<GroupEpochCacheClient>).mget === 'function' &&
    typeof (client as Partial<GroupEpochCacheClient>).incr === 'function'
  );
}

/**
 * Reads the badge and the current epochs in one round trip. `count` is `null` on a
 * miss (absent, foreign value, or an epoch that moved since the value was stored);
 * `epochs` are what the caller must store with a freshly counted value.
 */
export async function readUnreadCountWithEpochs(
  client: UnreadCountCacheClient | null,
  userId: string,
  groupIds: readonly string[],
): Promise<{ readonly count: number | null; readonly epochs: GroupEpochs | null }> {
  if (groupIds.length === 0 || !supportsEpochs(client)) {
    return { count: await readUnreadCountFromCache(client, userId), epochs: null };
  }
  try {
    const [stored, ...epochValues] = await client.mget(
      unreadCountCacheKey(userId),
      ...groupIds.map(groupUnreadEpochKey),
    );
    const epochs: Record<string, string> = {};
    groupIds.forEach((groupId, index) => {
      epochs[groupId] = epochValues[index] ?? '0';
    });
    if (stored === null || stored === undefined) {
      return { count: null, epochs };
    }
    const parsed = JSON.parse(stored) as { c?: unknown; e?: Record<string, unknown> };
    const count = typeof parsed?.c === 'number' && parsed.c >= 0 ? parsed.c : null;
    const same =
      parsed?.e !== undefined &&
      groupIds.every((groupId) => String(parsed.e?.[groupId] ?? '0') === epochs[groupId]);
    return { count: same ? count : null, epochs };
  } catch {
    return { count: null, epochs: null };
  }
}

export async function writeUnreadCountWithEpochs(
  client: UnreadCountCacheClient | null,
  userId: string,
  unreadCount: number,
  epochs: GroupEpochs | null,
): Promise<void> {
  if (epochs === null) {
    await writeUnreadCountToCache(client, userId, unreadCount);
    return;
  }
  if (client === null) {
    return;
  }
  try {
    await client.set(
      unreadCountCacheKey(userId),
      JSON.stringify({ c: unreadCount, e: epochs }),
      'EX',
      unreadCountCacheTtlSeconds,
    );
  } catch {
    // Same rule as above: a failed write only costs the next read a query.
  }
}

export async function bumpGroupUnreadEpoch(
  client: UnreadCountCacheClient | null,
  groupId: string,
): Promise<void> {
  if (!supportsEpochs(client)) {
    return;
  }
  try {
    await client.incr(groupUnreadEpochKey(groupId));
  } catch {
    // A missed bump is bounded by the 15 s TTL of the cached badges.
  }
}
