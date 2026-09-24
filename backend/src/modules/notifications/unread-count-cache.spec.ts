import { unreadCountCacheTtlSeconds } from './unread-count-cache.constants';
import {
  invalidateUnreadCountCache,
  readUnreadCountFromCache,
  unreadCountCacheKey,
  writeUnreadCountToCache,
  type UnreadCountCacheClient,
} from './unread-count-cache';

type StoredValue = { readonly value: string; readonly ttlSeconds: number };

function createFakeCache() {
  const entries = new Map<string, StoredValue>();
  const calls: string[] = [];
  const client: UnreadCountCacheClient = {
    get: async (key) => {
      calls.push(`get ${key}`);
      return entries.get(key)?.value ?? null;
    },
    set: async (key, value, mode, ttlSeconds) => {
      calls.push(`set ${key} ${value} ${mode} ${ttlSeconds}`);
      entries.set(key, { value, ttlSeconds });
      return 'OK';
    },
    del: async (key) => {
      calls.push(`del ${key}`);
      return entries.delete(key) ? 1 : 0;
    },
  };
  return { client, entries, calls };
}

const userId = 'user-agent-it';

describe('unread count cache', () => {
  it('reports a miss on an empty cache and after invalidation', async () => {
    const { client } = createFakeCache();
    expect(await readUnreadCountFromCache(client, userId)).toBeNull();

    await writeUnreadCountToCache(client, userId, 7);
    expect(await readUnreadCountFromCache(client, userId)).toBe(7);

    await invalidateUnreadCountCache(client, userId);
    expect(await readUnreadCountFromCache(client, userId)).toBeNull();
  });

  it('writes the entry under the user key with the fifteen second ttl', async () => {
    const { client, entries } = createFakeCache();
    await writeUnreadCountToCache(client, userId, 3);
    expect(entries.get(unreadCountCacheKey(userId))).toEqual({
      value: '3',
      ttlSeconds: unreadCountCacheTtlSeconds,
    });
  });

  it('treats a foreign value or a broken client as a miss, never as an error', async () => {
    const { client } = createFakeCache();
    const failing: UnreadCountCacheClient = {
      get: async () => {
        throw new Error('redis is down');
      },
      set: async () => {
        throw new Error('redis is down');
      },
      del: async () => {
        throw new Error('redis is down');
      },
    };
    // Garbage under the key (another writer, a truncated value).
    await writeUnreadCountToCache(client, userId, 4);
    client.get = async () => 'not-a-number';
    expect(await readUnreadCountFromCache(client, userId)).toBeNull();

    expect(await readUnreadCountFromCache(failing, userId)).toBeNull();
    // The write and the invalidation swallow the outage: the database stays the
    // source of truth and the next read simply misses.
    await expect(writeUnreadCountToCache(failing, userId, 1)).resolves.toBeUndefined();
    await expect(invalidateUnreadCountCache(failing, userId)).resolves.toBeUndefined();
  });

  it('is a no-op when there is no cache at all', async () => {
    expect(await readUnreadCountFromCache(null, userId)).toBeNull();
    await expect(writeUnreadCountToCache(null, userId, 2)).resolves.toBeUndefined();
    await expect(invalidateUnreadCountCache(null, userId)).resolves.toBeUndefined();
  });

  it('keys by user id so two people never share a badge', async () => {
    const { client } = createFakeCache();
    await writeUnreadCountToCache(client, 'user-a', 1);
    await writeUnreadCountToCache(client, 'user-b', 9);
    expect(await readUnreadCountFromCache(client, 'user-a')).toBe(1);
    expect(await readUnreadCountFromCache(client, 'user-b')).toBe(9);
  });
});
