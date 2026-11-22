import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createBullMqRootConfiguration } from '../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import {
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderQueueName,
  knowledgeBaseReviewReminderSchedulePattern,
  knowledgeBaseReviewReminderSchedulerId,
} from './knowledge-base-review-reminder.job.constants';
import { KnowledgeBaseReviewReminderSchedulerService } from './knowledge-base-review-reminder.scheduler.service';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

/**
 * W7.86 (`BA-knowledge-base-13`): real-Redis acceptance for the review-reminder
 * schedule self-heal. The unit spec proves the timer wiring with a fake queue; this
 * proves the behaviour against BullMQ itself — a registration removed the way a
 * Redis flush/failover removes it comes back, exactly once, with the same id.
 *
 * Runs only in the CI integration job (REDIS_HOST is set there); skipped elsewhere.
 */
describeIfRedis('knowledge review reminder scheduler reconciliation (Redis acceptance, W7.86)', () => {
  jest.setTimeout(15_000);
  let redis: IORedis;
  let queues: Queue[];

  beforeAll(() => {
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    redis = new IORedis({ ...root.connection, lazyConnect: true, maxRetriesPerRequest: null });
    redis.on('error', () => undefined);
  });

  beforeEach(() => {
    queues = [];
  });

  afterEach(async () => {
    await Promise.all(queues.map((queue) => queue.obliterate({ force: true }).catch(() => undefined)));
    await Promise.all(queues.map((queue) => queue.close().catch(() => undefined)));
    queues = [];
  });

  afterAll(() => {
    if (redis) redis.disconnect();
  });

  function createQueue(): Queue {
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    const queue = new Queue(knowledgeBaseReviewReminderQueueName, {
      connection: redis,
      prefix: `${root.prefix}:w786:${randomUUID()}`,
    });
    queues.push(queue);
    return queue;
  }

  it('restores the quarter-hourly sweep after Redis loses the registration', async () => {
    const queue = createQueue();
    const scheduler = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    try {
      await scheduler.onModuleInit();
      expect(await queue.getJobScheduler(knowledgeBaseReviewReminderSchedulerId)).toMatchObject({
        key: knowledgeBaseReviewReminderSchedulerId,
        name: knowledgeBaseReviewReminderJobName,
        pattern: knowledgeBaseReviewReminderSchedulePattern,
      });

      // Model a Redis restart/flush: the registration is simply gone.
      await queue.removeJobScheduler(knowledgeBaseReviewReminderSchedulerId);
      expect(await queue.getJobScheduler(knowledgeBaseReviewReminderSchedulerId)).toBeUndefined();

      await expect(scheduler.reconcileSchedule()).resolves.toEqual([
        knowledgeBaseReviewReminderSchedulerId,
      ]);
      expect(await queue.getJobScheduler(knowledgeBaseReviewReminderSchedulerId)).toMatchObject({
        key: knowledgeBaseReviewReminderSchedulerId,
        pattern: knowledgeBaseReviewReminderSchedulePattern,
      });

      // Idempotent: a second pass over a healthy registration changes nothing.
      await expect(scheduler.reconcileSchedule()).resolves.toEqual([]);
      const schedulers = await queue.getJobSchedulers(0, -1);
      expect(
        schedulers.filter((entry) => entry.id === knowledgeBaseReviewReminderSchedulerId),
      ).toHaveLength(1);
    } finally {
      scheduler.onModuleDestroy();
    }
  });

  it('registers exactly one schedule when two workers start against the same Redis', async () => {
    const queue = createQueue();
    const first = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    const second = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    try {
      await Promise.all([first.onModuleInit(), second.onModuleInit()]);
      const schedulers = await queue.getJobSchedulers(0, -1);
      expect(
        schedulers.filter((entry) => entry.id === knowledgeBaseReviewReminderSchedulerId),
      ).toHaveLength(1);
    } finally {
      first.onModuleDestroy();
      second.onModuleDestroy();
    }
  });
});
