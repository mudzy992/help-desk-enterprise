import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createBullMqRootConfiguration } from '../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import { WorkerScheduleReconcilerService } from '../../worker-schedule-reconciler.service';
import { AssetDirectorySyncSchedulerService } from './directory/asset-directory-sync.scheduler.service';
import {
  assetDirectorySyncCronPattern,
  assetDirectorySyncJobName,
  assetDirectorySyncQueueName,
  assetDirectorySyncSchedulerId,
} from './directory/asset-directory-sync.constants';
import { AssetRemindersSchedulerService } from './reminders/asset-reminders.scheduler.service';
import {
  assetRemindersCronPattern,
  assetRemindersJobName,
  assetRemindersQueueName,
  assetRemindersSchedulerId,
} from './reminders/asset-reminders.constants';

const describeIfRedis = process.env.REDIS_HOST?.trim() ? describe : describe.skip;

describeIfRedis('asset scheduler reconciliation (Redis acceptance, W7.10)', () => {
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
    await Promise.all(
      queues.map((queue) => queue.obliterate({ force: true }).catch(() => undefined)),
    );
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
      prefix: `${root.prefix}:w7-10:${randomUUID()}`,
    });
    queues.push(queue);
    return queue;
  }

  it('re-registers both asset repeatable jobs after Redis loses their scheduler records', async () => {
    const directoryQueue = createQueue(assetDirectorySyncQueueName);
    const remindersQueue = createQueue(assetRemindersQueueName);
    const directoryScheduler = new AssetDirectorySyncSchedulerService(directoryQueue);
    const remindersScheduler = new AssetRemindersSchedulerService(remindersQueue);
    const reconciler = new WorkerScheduleReconcilerService(
      {
        getProviders: () =>
          [directoryScheduler, remindersScheduler].map((instance) => ({ instance })),
      } as never,
      { getClient: () => redis } as never,
    );

    await Promise.all([directoryScheduler.onModuleInit(), remindersScheduler.onModuleInit()]);
    expect(await directoryQueue.getJobScheduler(assetDirectorySyncSchedulerId)).toMatchObject({
      key: assetDirectorySyncSchedulerId,
      name: assetDirectorySyncJobName,
      pattern: assetDirectorySyncCronPattern,
    });
    expect(await remindersQueue.getJobScheduler(assetRemindersSchedulerId)).toMatchObject({
      key: assetRemindersSchedulerId,
      name: assetRemindersJobName,
      pattern: assetRemindersCronPattern,
    });

    // Removing the BullMQ scheduler entries models the entries lost on a Redis
    // flush/restart without flushing the shared integration Redis instance.
    await Promise.all([
      directoryQueue.removeJobScheduler(assetDirectorySyncSchedulerId),
      remindersQueue.removeJobScheduler(assetRemindersSchedulerId),
    ]);
    expect(await directoryQueue.getJobScheduler(assetDirectorySyncSchedulerId)).toBeUndefined();
    expect(await remindersQueue.getJobScheduler(assetRemindersSchedulerId)).toBeUndefined();

    await reconciler.reconcile();

    expect(await directoryQueue.getJobScheduler(assetDirectorySyncSchedulerId)).toMatchObject({
      key: assetDirectorySyncSchedulerId,
      name: assetDirectorySyncJobName,
      pattern: assetDirectorySyncCronPattern,
    });
    expect(await remindersQueue.getJobScheduler(assetRemindersSchedulerId)).toMatchObject({
      key: assetRemindersSchedulerId,
      name: assetRemindersJobName,
      pattern: assetRemindersCronPattern,
    });
    reconciler.onModuleDestroy();
  });
});
