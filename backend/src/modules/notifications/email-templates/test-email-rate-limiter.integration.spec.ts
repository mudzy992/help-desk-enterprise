import { randomUUID } from "node:crypto";
import { closeRedisClient } from "../../../common/redis/close-redis-client";
import { createRedisClient } from "../../../common/redis/create-redis-client";
import { loadRedisConfiguration } from "../../../common/redis/load-redis-configuration";
import type Redis from "ioredis";
import {
  TestEmailRateLimiter,
  testEmailRateLimiterKey,
  testEmailSendLimit,
  testEmailSendWindowMs,
} from "./test-email-rate-limiter";

const describeIfRedis = process.env.REDIS_HOST?.trim()
  ? describe
  : describe.skip;

describeIfRedis(
  "test-email rate limit (Redis acceptance, BA-notifications-13)",
  () => {
    jest.setTimeout(15_000);
    let firstClient: Redis;
    let secondClient: Redis;
    let firstLimiter: TestEmailRateLimiter;
    let secondLimiter: TestEmailRateLimiter;
    const keys = new Set<string>();

    beforeAll(() => {
      const configuration = loadRedisConfiguration();
      firstClient = createRedisClient(configuration);
      secondClient = createRedisClient(configuration);
      firstClient.on("error", () => undefined);
      secondClient.on("error", () => undefined);
      firstLimiter = new TestEmailRateLimiter(firstClient);
      secondLimiter = new TestEmailRateLimiter(secondClient);
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

    it("enforces one atomic limit across two clients and expires each Redis bucket", async () => {
      const actorKey = `ba13-integration-${randomUUID()}`;
      const now = Date.now();
      const firstBucketKey = testEmailRateLimiterKey(actorKey, now);
      const nextBucketTime = now + testEmailSendWindowMs;
      const nextBucketKey = testEmailRateLimiterKey(actorKey, nextBucketTime);
      keys.add(firstBucketKey);
      keys.add(nextBucketKey);

      const firstWindowResults = await Promise.all(
        Array.from({ length: testEmailSendLimit + 3 }, (_, index) =>
          (index % 2 === 0 ? firstLimiter : secondLimiter).consume(
            actorKey,
            now,
          ),
        ),
      );

      expect(firstWindowResults.filter(Boolean)).toHaveLength(
        testEmailSendLimit,
      );
      expect(firstWindowResults.filter((allowed) => !allowed)).toHaveLength(3);
      expect(await firstClient.get(firstBucketKey)).toBe(
        String(testEmailSendLimit + 3),
      );
      const firstBucketTtl = await firstClient.pttl(firstBucketKey);
      expect(firstBucketTtl).toBeGreaterThan(0);
      expect(firstBucketTtl).toBeLessThanOrEqual(testEmailSendWindowMs);

      await expect(
        secondLimiter.consume(actorKey, nextBucketTime),
      ).resolves.toBe(true);
      expect(await secondClient.get(nextBucketKey)).toBe("1");
      const nextBucketTtl = await secondClient.pttl(nextBucketKey);
      expect(nextBucketTtl).toBeGreaterThan(0);
      expect(nextBucketTtl).toBeLessThanOrEqual(testEmailSendWindowMs);
    });
  },
);
