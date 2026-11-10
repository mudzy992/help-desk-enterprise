import { randomUUID } from 'node:crypto';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import type Redis from 'ioredis';
import {
  RedisWebsocketAbuseStore,
  websocketTokenBucketTtlMs,
  type WebsocketTokenBucketPolicy,
} from './websocket-abuse-limiter';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

describeIfRedis('WebSocket admission limits (Redis acceptance, BA-websocket-06)', () => {
  jest.setTimeout(15_000);
  let firstClient: Redis;
  let secondClient: Redis;
  let firstStore: RedisWebsocketAbuseStore;
  let secondStore: RedisWebsocketAbuseStore;
  const keys = new Set<string>();

  beforeAll(() => {
    const configuration = loadRedisConfiguration();
    firstClient = createRedisClient(configuration);
    secondClient = createRedisClient(configuration);
    firstClient.on('error', () => undefined);
    secondClient.on('error', () => undefined);
    firstStore = new RedisWebsocketAbuseStore(firstClient);
    secondStore = new RedisWebsocketAbuseStore(secondClient);
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

  it('shares one atomic token bucket across independent API clients with a bounded TTL', async () => {
    const key = `ws:admission:integration:bucket:${randomUUID()}`;
    keys.add(key);
    const policy: WebsocketTokenBucketPolicy = {
      capacity: 5,
      refillIntervalMs: 60_000,
    };
    const attempts = await Promise.all(
      Array.from({ length: 17 }, (_, index) =>
        (index % 2 === 0 ? firstStore : secondStore).consumeToken(key, policy),
      ),
    );

    expect(attempts.filter(Boolean)).toHaveLength(policy.capacity);
    expect(attempts.filter((allowed) => !allowed)).toHaveLength(
      17 - policy.capacity,
    );
    const ttl = await firstClient.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(websocketTokenBucketTtlMs(policy));
  });

  it('enforces a concurrent user connection cap across clients and recovers released/expired leases', async () => {
    const connectionKey = `ws:admission:integration:connections:${randomUUID()}`;
    const expiryKey = `ws:admission:integration:expiry:${randomUUID()}`;
    keys.add(connectionKey);
    keys.add(expiryKey);

    const members = ['instance-a/socket-1', 'instance-b/socket-2', 'instance-a/socket-3'];
    const reservations = await Promise.all(
      members.map((member, index) =>
        (index % 2 === 0 ? firstStore : secondStore).reserveConnection(
          connectionKey,
          member,
          2,
          2_000,
        ),
      ),
    );
    expect(reservations.filter(Boolean)).toHaveLength(2);
    expect(reservations.filter((reserved) => !reserved)).toHaveLength(1);

    const releasedMember = members[reservations.findIndex(Boolean)];
    if (releasedMember === undefined) {
      throw new Error('Expected at least one reserved WebSocket connection');
    }
    await firstStore.releaseConnection(connectionKey, releasedMember);
    await expect(
      secondStore.reserveConnection(connectionKey, 'instance-c/socket-4', 2, 2_000),
    ).resolves.toBe(true);

    await expect(
      firstStore.reserveConnection(expiryKey, 'stale/socket', 1, 150),
    ).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 225));
    await expect(
      secondStore.reserveConnection(expiryKey, 'new/socket', 1, 2_000),
    ).resolves.toBe(true);
  });
});
