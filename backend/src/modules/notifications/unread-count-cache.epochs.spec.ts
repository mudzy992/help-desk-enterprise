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
  it('hits while no group event happened, misses after a bump', async () => {
    const redis = fakeRedis();
    const miss = await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2']);
    expect(miss.count).toBeNull();
    await writeUnreadCountWithEpochs(redis, 'u1', 3, miss.epochs);
    expect((await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2'])).count).toBe(3);

    await bumpGroupUnreadEpoch(redis, 'g2');
    expect((await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g2'])).count).toBeNull();
  });

  it('treats a changed membership as a miss', async () => {
    const redis = fakeRedis();
    const first = await readUnreadCountWithEpochs(redis, 'u1', ['g1']);
    await writeUnreadCountWithEpochs(redis, 'u1', 2, first.epochs);
    await bumpGroupUnreadEpoch(redis, 'g9');
    expect((await readUnreadCountWithEpochs(redis, 'u1', ['g1', 'g9'])).count).toBeNull();
  });

  it('falls back to the plain entry for users without groups', async () => {
    const redis = fakeRedis();
    const read = await readUnreadCountWithEpochs(redis, 'u1', []);
    expect(read.epochs).toBeNull();
    await writeUnreadCountWithEpochs(redis, 'u1', 4, null);
    expect((await readUnreadCountWithEpochs(redis, 'u1', [])).count).toBe(4);
  });

  it('never throws when Redis is absent or failing', async () => {
    expect(await readUnreadCountWithEpochs(null, 'u1', ['g1'])).toEqual({
      count: null,
      epochs: null,
    });
    const broken = { ...fakeRedis(), mget: async () => Promise.reject(new Error('down')) };
    expect((await readUnreadCountWithEpochs(broken, 'u1', ['g1'])).count).toBeNull();
    await expect(bumpGroupUnreadEpoch(null, 'g1')).resolves.toBeUndefined();
  });
});
