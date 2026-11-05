import {
  bumpGroupUnreadEpoch,
  readUnreadCountWithEpochs,
  writeUnreadCountWithEpochs,
} from './unread-count-cache';

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => store.delete(key),
    mget: async (...keys: string[]) => keys.map((key) => store.get(key) ?? null),
    incr: async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return next;
    },
  };
}

describe('unread badge cache with group epochs (option A)', () => {
  it('hits while the audience and epochs are unchanged, misses after a group bump', async () => {
    const redis = fakeRedis();
    const audience = 'member:g1:g2';
    const miss = await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2'], audience);
    expect(miss.count).toBeNull();
    await writeUnreadCountWithEpochs(redis, 'u1', 3, miss.epochs, audience);
    expect((await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2'], audience)).count).toBe(3);

    await bumpGroupUnreadEpoch(redis, 'g2');
    expect((await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2'], audience)).count).toBeNull();
  });

  it('invalidates the badge on removal or re-adding the same group membership', async () => {
    const redis = fakeRedis();
    const originalMembership = 'member:g1:row-1';
    const first = await readUnreadCountWithEpochs(redis, 'u1', ['g1'], originalMembership);
    await writeUnreadCountWithEpochs(redis, 'u1', 2, first.epochs, originalMembership);

    // Membership was deleted and recreated with a new row ID; the group epoch did
    // not change, but the old badge still cannot be reused.
    expect(
      (await readUnreadCountWithEpochs(redis, 'u1', ['g1'], 'member:g1:row-2')).count,
    ).toBeNull();

    // Removal of the last group also changes the audience even though the user key
    // and group epoch key are the same Redis entries.
    expect((await readUnreadCountWithEpochs(redis, 'u1', [], '[]')).count).toBeNull();
    await writeUnreadCountWithEpochs(redis, 'u1', 0, null, '[]');
    expect((await readUnreadCountWithEpochs(redis, 'u1', [], '[]')).count).toBe(0);
  });

  it('treats a changed membership set as a miss', async () => {
    const redis = fakeRedis();
    const first = await readUnreadCountWithEpochs(redis, 'u1', ['g1'], 'member:g1');
    await writeUnreadCountWithEpochs(redis, 'u1', 2, first.epochs, 'member:g1');
    await bumpGroupUnreadEpoch(redis, 'g9');
    expect(
      (await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g9'], 'member:g1,g9')).count,
    ).toBeNull();
  });

  it('never throws when Redis is absent or failing', async () => {
    expect(await readUnreadCountWithEpochs(null, 'u1', ['g1'], 'member:g1')).toEqual({
      count: null,
      epochs: null,
    });
    const broken = {
      ...fakeRedis(),
      mget: async () => Promise.reject(new Error('down')),
    };
    expect((await readUnreadCountWithEpochs(broken, 'u1', ['g1'], 'member:g1')).count).toBeNull();
    await expect(bumpGroupUnreadEpoch(null, 'g1')).resolves.toBeUndefined();
  });
});
