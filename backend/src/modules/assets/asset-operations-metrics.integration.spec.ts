import { randomUUID } from 'node:crypto';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import type Redis from 'ioredis';
import {
  AssetOperationsMetricStore,
  assetOperationsMetricEvents,
  assetOperationsMetricKey,
  assetOperationsMetricTtlSeconds,
} from './asset-operations-metrics';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

describeIfRedis('asset operations counters (Redis acceptance, W7.18)', () => {
  jest.setTimeout(15_000);
  let firstClient: Redis;
  let secondClient: Redis;
  let firstStore: AssetOperationsMetricStore;
  let secondStore: AssetOperationsMetricStore;
  const keys = new Set<string>();

  beforeAll(() => {
    const configuration = loadRedisConfiguration();
    firstClient = createRedisClient(configuration);
    secondClient = createRedisClient(configuration);
    firstClient.on('error', () => undefined);
    secondClient.on('error', () => undefined);
    firstStore = new AssetOperationsMetricStore(firstClient);
    secondStore = new AssetOperationsMetricStore(secondClient);
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

  it('shares atomic counters across independent clients and expires buckets within the fixed bound', async () => {
    const minute =
      Math.floor(Date.now() / 60_000) +
      24 * 60 +
      (Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) % (365 * 24 * 60));
    const bucketTime = new Date(minute * 60_000 + 5_000);
    const auditKey = assetOperationsMetricKey(assetOperationsMetricEvents.auditWriteFailure, minute);
    const overlapKey = assetOperationsMetricKey(assetOperationsMetricEvents.directorySyncOverlap, minute);
    keys.add(auditKey);
    keys.add(overlapKey);

    await Promise.all([
      ...Array.from({ length: 9 }, (_, index) =>
        (index % 2 === 0 ? firstStore : secondStore).increment(
          assetOperationsMetricEvents.auditWriteFailure,
          bucketTime,
        ),
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        (index % 2 === 0 ? secondStore : firstStore).increment(
          assetOperationsMetricEvents.directorySyncOverlap,
          bucketTime,
        ),
      ),
    ]);

    expect(await firstClient.get(auditKey)).toBe('9');
    expect(await secondClient.get(overlapKey)).toBe('7');
    for (const key of [auditKey, overlapKey]) {
      const ttl = await firstClient.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(assetOperationsMetricTtlSeconds);
    }

    await expect(firstStore.readLastHour(new Date((minute + 1) * 60_000))).resolves.toEqual({
      directorySyncOverlapsLastHour: 7,
      auditWriteFailuresLastHour: 9,
    });
  });
});
