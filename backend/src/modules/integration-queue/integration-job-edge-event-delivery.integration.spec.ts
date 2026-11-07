import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import type Redis from 'ioredis';
import { IntegrationJobRepository } from './integration-job.repository';
import { IntegrationQueueProcessor } from './integration-queue.processor';
import { edgeEventRedisChannel } from './integration-queue.constants';
import {
  edgeEventNoSubscribersCode,
  ProcessEdgeEventIntegrationJobService,
} from './process-edge-event-integration-job.service';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const redisReady = process.env.REDIS_HOST?.trim();
const describeIfReady = databaseUrl && redisReady ? describe : describe.skip;

describeIfReady(
  'Edge event publication outcome (PostgreSQL + Redis integration, BA-integration-queue-03)',
  () => {
    jest.setTimeout(30_000);

    let prisma: PrismaClient;
    let repository: IntegrationJobRepository;
    let publisher: Redis;
    let subscriber: Redis | undefined;
    let processor: IntegrationQueueProcessor;
    const jobIds: string[] = [];
    const queue = { add: jest.fn().mockResolvedValue(undefined) };

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      repository = new IntegrationJobRepository(prisma as never);
      const redisConfiguration = loadRedisConfiguration();
      publisher = createRedisClient(redisConfiguration);
      publisher.on('error', () => undefined);
      await publisher.ping();

      const settingsService = {
        getSetting: jest.fn().mockResolvedValue(undefined),
      };
      const processEdgeEvent = new ProcessEdgeEventIntegrationJobService(
        new PublishEdgeEventToRedisService(publisher),
      );
      processor = new IntegrationQueueProcessor(
        repository,
        settingsService as never,
        { process: jest.fn().mockResolvedValue(undefined) } as never,
        processEdgeEvent,
        { process: jest.fn().mockResolvedValue(undefined) } as never,
        queue as never,
      );
    });

    afterEach(async () => {
      if (subscriber !== undefined) {
        await closeRedisClient(subscriber);
        subscriber = undefined;
      }
      if (jobIds.length > 0) {
        await prisma.integrationJob.deleteMany({
          where: { id: { in: [...jobIds] } },
        });
        jobIds.length = 0;
      }
      queue.add.mockClear();
    });

    afterAll(async () => {
      if (publisher) await closeRedisClient(publisher);
      await prisma.$disconnect();
    });

    async function createPendingEdgeJob() {
      const id = randomUUID();
      const job = await prisma.integrationJob.create({
        data: {
          type: IntegrationJobType.EDGE_EVENT,
          payload: {
            userId: 'integration-test-user',
            eventName: `edge-best-effort-${id}`,
            data: { integrationTest: true },
          },
        },
      });
      jobIds.push(job.id);
      return job;
    }

    function waitForMessage(client: Redis): Promise<string> {
      return new Promise((resolve, reject) => {
        let cleanup = () => undefined;
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for Redis Edge event publication'));
        }, 5_000);
        const onMessage = (channel: string, message: string) => {
          if (channel !== edgeEventRedisChannel) return;
          cleanup();
          resolve(message);
        };
        cleanup = () => {
          clearTimeout(timeout);
          client.off('message', onMessage);
        };
        client.on('message', onMessage);
      });
    }

    it('keeps a zero-subscriber PUBLISH retryable instead of marking the job completed', async () => {
      await expect(
        publisher.publish(edgeEventRedisChannel, 'integration-zero-subscriber-probe'),
      ).resolves.toBe(0);
      const job = await createPendingEdgeJob();

      await processor.process({
        id: job.id,
        data: { integrationJobId: job.id },
      } as never);

      const stored = await prisma.integrationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored).toMatchObject({
        status: IntegrationJobStatus.FAILED,
        attempts: 1,
        lastError: edgeEventNoSubscribersCode,
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      });
      expect(stored.nextRetryAt).toBeInstanceOf(Date);
      expect(queue.add).toHaveBeenCalledWith(
        IntegrationJobType.EDGE_EVENT,
        { integrationJobId: job.id },
        expect.objectContaining({ jobId: `${job.id}:1`, delay: 60_000 }),
      );
    });

    it('records a positive Redis subscriber count as best-effort, not end-to-end delivery', async () => {
      subscriber = createRedisClient(loadRedisConfiguration());
      subscriber.on('error', () => undefined);
      await subscriber.subscribe(edgeEventRedisChannel);
      const receivedMessage = waitForMessage(subscriber);
      const job = await createPendingEdgeJob();

      await processor.process({
        id: job.id,
        data: { integrationJobId: job.id },
      } as never);

      const stored = await prisma.integrationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      const published = JSON.parse(await receivedMessage) as Record<string, unknown>;
      expect(stored).toMatchObject({
        status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
        attempts: 1,
        lastError: null,
        nextRetryAt: null,
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      });
      expect(published).toMatchObject({
        userId: 'integration-test-user',
        eventName: (job.payload as { eventName: string }).eventName,
        data: { integrationTest: true },
      });
      expect(queue.add).not.toHaveBeenCalled();
    });
  },
);
