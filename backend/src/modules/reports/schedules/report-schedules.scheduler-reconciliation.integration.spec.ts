import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createBullMqRootConfiguration } from '../../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../../common/redis/load-redis-configuration';
import { isSchedulerRegistered } from '../../../common/scheduled-jobs/job-scheduler-presence';
import {
  reportSchedulesCronPattern,
  reportSchedulesQueueName,
  reportSchedulesSchedulerId,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';
import { ReportSchedulesSchedulerService } from './report-schedules.scheduler.service';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

/**
 * W7.98 (`BA-reports-08`): real-Redis acceptance for the report sweep self-heal. The unit spec proves the timer
 * wiring against a fake queue; this proves the behaviour against BullMQ itself — a registration removed the way a
 * Redis flush or failover removes it comes back, exactly once, with the same id.
 *
 * Runs only in the CI integration job (REDIS_HOST is set there); skipped elsewhere.
 */
describeIfRedis('report schedules scheduler reconciliation (Redis acceptance, W7.98)', () => {
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
    const queue = new Queue(reportSchedulesQueueName, {
      connection: redis,
      prefix: `${root.prefix}:w798:${randomUUID()}`,
    });
    queues.push(queue);
    return queue;
  }

  function registered(entries: readonly { key?: string | null; id?: string | null }[]): number {
    // BullMQ 5.81 reports the id as `key`; both shapes are accepted.
    return entries.filter(
      (entry) => entry.key === reportSchedulesSchedulerId || entry.id === reportSchedulesSchedulerId,
    ).length;
  }

  it('restores the five-minute sweep after Redis loses the registration', async () => {
    const queue = createQueue();
    const scheduler = new ReportSchedulesSchedulerService(queue as never);
    try {
      await scheduler.onModuleInit();
      expect(await queue.getJobScheduler(reportSchedulesSchedulerId)).toMatchObject({
        key: reportSchedulesSchedulerId,
        name: reportSchedulesSweepJobName,
        pattern: reportSchedulesCronPattern,
      });

      // Model a Redis restart/flush: the registration is simply gone.
      await queue.removeJobScheduler(reportSchedulesSchedulerId);
      expect(await queue.getJobScheduler(reportSchedulesSchedulerId)).toBeUndefined();

      await expect(scheduler.reconcileSchedule()).resolves.toEqual([reportSchedulesSchedulerId]);
      expect(await queue.getJobScheduler(reportSchedulesSchedulerId)).toMatchObject({
        key: reportSchedulesSchedulerId,
        pattern: reportSchedulesCronPattern,
      });

      // Idempotent: a second pass over a healthy registration changes nothing.
      await expect(scheduler.reconcileSchedule()).resolves.toEqual([]);
      const schedulers = await queue.getJobSchedulers(0, -1);
      expect(isSchedulerRegistered(schedulers, reportSchedulesSchedulerId)).toBe(true);
      expect(registered(schedulers)).toBe(1);
    } finally {
      scheduler.onModuleDestroy();
    }
  });

  it('registers exactly one schedule when two workers start against the same Redis', async () => {
    const queue = createQueue();
    const first = new ReportSchedulesSchedulerService(queue as never);
    const second = new ReportSchedulesSchedulerService(queue as never);
    try {
      await Promise.all([first.onModuleInit(), second.onModuleInit()]);
      const schedulers = await queue.getJobSchedulers(0, -1);
      expect(isSchedulerRegistered(schedulers, reportSchedulesSchedulerId)).toBe(true);
      expect(registered(schedulers)).toBe(1);
    } finally {
      first.onModuleDestroy();
      second.onModuleDestroy();
    }
  });
});
