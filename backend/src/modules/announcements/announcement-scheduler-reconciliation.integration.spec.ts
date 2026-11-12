import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createBullMqRootConfiguration } from '../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import {
  announcementRetentionJobName,
  announcementRetentionQueueName,
  announcementRetentionSchedulePattern,
  announcementRetentionSchedulerId,
} from './announcement-retention.job.constants';
import { AnnouncementRetentionSchedulerService } from './announcement-retention.scheduler.service';
import {
  announcementSweepJobName,
  announcementSweepQueueName,
  announcementSweepSchedulePattern,
  announcementSweepSchedulerId,
} from './announcement-sweep.job.constants';
import { AnnouncementSweepSchedulerService } from './announcement-sweep.scheduler.service';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

/**
 * BA-announcements-19: real-Redis acceptance for the announcement schedulers
 * (the BA-11 sweep self-heal and the BA-17 retention self-heal). Runs only in
 * the CI integration job, where REDIS_HOST is set; skipped elsewhere.
 */
describeIfRedis('announcement scheduler reconciliation (Redis acceptance, BA-19)', () => {
  jest.setTimeout(15_000);
  let redis: IORedis;
  let queues: Queue[];

  beforeEach(() => {
    queues = [];
  });

  beforeAll(() => {
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    redis = new IORedis({ ...root.connection, lazyConnect: true, maxRetriesPerRequest: null });
    redis.on('error', () => undefined);
  });

  afterEach(async () => {
    await Promise.all(queues.map((queue) => queue.obliterate({ force: true }).catch(() => undefined)));
    await Promise.all(queues.map((queue) => queue.close().catch(() => undefined)));
    queues = [];
  });

  afterAll(() => {
    if (redis) redis.disconnect();
  });

  function createQueue(name: string): Queue {
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    const queue = new Queue(name, {
      connection: redis,
      prefix: `${root.prefix}:ba-19:${randomUUID()}`,
    });
    queues.push(queue);
    return queue;
  }

  it('re-registers the sweep and retention schedulers after Redis loses them', async () => {
    const sweepQueue = createQueue(announcementSweepQueueName);
    const retentionQueue = createQueue(announcementRetentionQueueName);
    const sweepScheduler = new AnnouncementSweepSchedulerService(sweepQueue as never);
    const retentionScheduler = new AnnouncementRetentionSchedulerService(retentionQueue as never);
    try {
      await Promise.all([sweepScheduler.onModuleInit(), retentionScheduler.onModuleInit()]);
      expect(await sweepQueue.getJobScheduler(announcementSweepSchedulerId)).toMatchObject({
        key: announcementSweepSchedulerId,
        name: announcementSweepJobName,
        pattern: announcementSweepSchedulePattern,
      });
      expect(await retentionQueue.getJobScheduler(announcementRetentionSchedulerId)).toMatchObject({
        key: announcementRetentionSchedulerId,
        name: announcementRetentionJobName,
        pattern: announcementRetentionSchedulePattern,
      });

      // Model a Redis flush/failover by removing just these scheduler records.
      await Promise.all([
        sweepQueue.removeJobScheduler(announcementSweepSchedulerId),
        retentionQueue.removeJobScheduler(announcementRetentionSchedulerId),
      ]);
      expect(await sweepQueue.getJobScheduler(announcementSweepSchedulerId)).toBeUndefined();
      expect(await retentionQueue.getJobScheduler(announcementRetentionSchedulerId)).toBeUndefined();

      await expect(sweepScheduler.reconcileSchedule()).resolves.toEqual([announcementSweepSchedulerId]);
      await expect(retentionScheduler.reconcileSchedule()).resolves.toEqual([announcementRetentionSchedulerId]);
      expect(await sweepQueue.getJobScheduler(announcementSweepSchedulerId)).toMatchObject({
        key: announcementSweepSchedulerId,
      });
      expect(await retentionQueue.getJobScheduler(announcementRetentionSchedulerId)).toMatchObject({
        key: announcementRetentionSchedulerId,
      });
    } finally {
      sweepScheduler.onModuleDestroy();
      retentionScheduler.onModuleDestroy();
    }
  });
});
