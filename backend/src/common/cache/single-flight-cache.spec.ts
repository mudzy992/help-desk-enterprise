import { createSingleFlightCache, readTtlMsFromEnvironment } from './single-flight-cache';

describe('createSingleFlightCache', () => {
  it('shares one computation between concurrent callers', async () => {
    const cache = createSingleFlightCache<number>({ ttlMs: 0 });
    let release: (value: number) => void = () => undefined;
    const compute = jest.fn(() => new Promise<number>((resolve) => (release = resolve)));
    const a = cache.get('k', compute);
    const b = cache.get('k', compute);
    release(7);
    await expect(Promise.all([a, b])).resolves.toEqual([7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
    // ttl 0: the next call computes again.
    await cache.get('k', async () => 8);
    expect(await cache.get('k', async () => 9)).toBe(9);
  });

  it('reuses a value within the ttl and drops it afterwards', async () => {
    let clock = 0;
    const cache = createSingleFlightCache<number>({ ttlMs: 100, now: () => clock });
    expect(await cache.get('k', async () => 1)).toBe(1);
    clock = 99;
    expect(await cache.get('k', async () => 2)).toBe(1);
    clock = 100;
    expect(await cache.get('k', async () => 3)).toBe(3);
  });

  it('never caches failures', async () => {
    const cache = createSingleFlightCache<number>({ ttlMs: 1000 });
    await expect(cache.get('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await cache.get('k', async () => 5)).toBe(5);
  });

  it('bounds the number of entries', async () => {
    const cache = createSingleFlightCache<number>({ ttlMs: 1000, maxEntries: 2 });
    for (const key of ['a', 'b', 'c']) {
      await cache.get(key, async () => 1);
    }
    expect(cache.size).toBe(2);
  });

  it('reads the ttl from the environment with a fallback', () => {
    process.env.SF_TEST_TTL = '250';
    expect(readTtlMsFromEnvironment('SF_TEST_TTL', 5)).toBe(250);
    process.env.SF_TEST_TTL = 'nope';
    expect(readTtlMsFromEnvironment('SF_TEST_TTL', 5)).toBe(5);
    delete process.env.SF_TEST_TTL;
    expect(readTtlMsFromEnvironment('SF_TEST_TTL', 5)).toBe(5);
  });
});
