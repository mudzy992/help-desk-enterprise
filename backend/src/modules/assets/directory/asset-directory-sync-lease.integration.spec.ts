import { randomUUID } from 'node:crypto';
import { closeRedisClient } from '../../../common/redis/close-redis-client';
import { createRedisClient } from '../../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../../common/redis/load-redis-configuration';
import type Redis from 'ioredis';
import { AssetDirectorySyncLease } from './asset-directory-sync-lease';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

describeIfRedis('asset directory sync distributed lease (Redis acceptance, W7.9)', () => {
  jest.setTimeout(15_000);
  let firstClient: Redis;
  let secondClient: Redis;
  const keys = new Set<string>();

  beforeAll(() => {
    const configuration = loadRedisConfiguration();
    firstClient = createRedisClient(configuration);
    secondClient = createRedisClient(configuration);
    firstClient.on('error', () => undefined);
    secondClient.on('error', () => undefined);
  });

  afterEach(async () => {
    if (keys.size > 0) {
      await firstClient.del(...keys).catch(() => 0);
      keys.clear();
    }
  });

  afterAll(async () => {
    if (firstClient) await closeRedisClient(firstClient);
    if (secondClient) await closeRedisClient(secondClient);
  });

  function key(): string {
    const value = `assets:directory-sync:integration:${randomUUID()}`;
    keys.add(value);
    return value;
  }

  it('allows one owner across independent clients and renews until owner-checked release', async () => {
    const redisKey = key();
    const first = new AssetDirectorySyncLease(firstClient, {
      key: redisKey,
      ttlMilliseconds: 300,
      renewEveryMilliseconds: 50,
      commandTimeoutMilliseconds: 1_000,
    });
    const second = new AssetDirectorySyncLease(secondClient, {
      key: redisKey,
      ttlMilliseconds: 300,
      renewEveryMilliseconds: 50,
      commandTimeoutMilliseconds: 1_000,
    });

    const results = await Promise.all([first.tryAcquire('run-a'), second.tryAcquire('run-b')]);
    const ownerIndex = results.findIndex((result) => result !== null);
    if (ownerIndex < 0) throw new Error('Redis failed to grant a lease to either contender');
    const owner = results[ownerIndex];
    if (owner === null || owner === undefined) throw new Error('Redis lease result is missing');
    const loser = ownerIndex === 0 ? second : first;
    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    const value = await firstClient.get(redisKey);
    expect(JSON.parse(value ?? 'null')).toMatchObject({ runId: owner.runId, ownerToken: expect.any(String) });

    await new Promise((resolve) => setTimeout(resolve, 450));
    await owner.assertOwned();
    await expect(loser.tryAcquire('run-c')).resolves.toBeNull();
    await expect(owner.release()).resolves.toBe(true);

    const successor = await loser.tryAcquire('run-c');
    expect(successor).not.toBeNull();
    await expect(owner.release()).resolves.toBe(false);
    expect(await firstClient.get(redisKey)).not.toBeNull();
    await successor!.release();
  });

  it('recovers automatically after the previous owner crashes and the TTL expires', async () => {
    const redisKey = key();
    const first = new AssetDirectorySyncLease(firstClient, {
      key: redisKey,
      ttlMilliseconds: 250,
      renewEveryMilliseconds: 0,
      commandTimeoutMilliseconds: 1_000,
    });
    const second = new AssetDirectorySyncLease(secondClient, {
      key: redisKey,
      ttlMilliseconds: 250,
      renewEveryMilliseconds: 0,
      commandTimeoutMilliseconds: 1_000,
    });

    const abandoned = await first.tryAcquire('abandoned-run');
    expect(abandoned).not.toBeNull();
    await expect(second.tryAcquire('too-early')).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 350));

    const recovered = await second.tryAcquire('recovered-run');
    expect(recovered).not.toBeNull();
    expect(recovered!.runId).toBe('recovered-run');
    await recovered!.release();
  });
});
