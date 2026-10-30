import { assetSchedulerRegistrationTimeoutMs } from './assets.constants';
import { AssetDirectorySyncSchedulerService } from './directory/asset-directory-sync.scheduler.service';
import {
  assetDirectorySyncCronPattern,
  assetDirectorySyncJobAttempts,
  assetDirectorySyncJobName,
  assetDirectorySyncSchedulerId,
} from './directory/asset-directory-sync.constants';
import { AssetRemindersSchedulerService } from './reminders/asset-reminders.scheduler.service';
import {
  WorkerScheduleReconcilerService,
  workerScheduleReconcileIntervalMs,
} from '../../worker-schedule-reconciler.service';
import {
  assetRemindersCronPattern,
  assetRemindersJobAttempts,
  assetRemindersJobBackoffMilliseconds,
  assetRemindersJobName,
  assetRemindersSchedulerId,
} from './reminders/asset-reminders.constants';

describe('asset repeatable schedulers (W7.10)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('bounds a hanging Redis registration so worker startup can continue', async () => {
    jest.useFakeTimers();
    const queue = {
      upsertJobScheduler: jest.fn(() => new Promise<never>(() => undefined)),
    };
    const scheduler = new AssetDirectorySyncSchedulerService(queue as never);
    const startup = scheduler.onModuleInit();

    await jest.advanceTimersByTimeAsync(assetSchedulerRegistrationTimeoutMs);
    await expect(startup).resolves.toBeUndefined();
  });

  it('automatically recovers a failed startup registration on the worker retry timer', async () => {
    jest.useFakeTimers();
    const queue = {
      upsertJobScheduler: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis unavailable at module init'))
        .mockRejectedValueOnce(new Error('Redis still unavailable at bootstrap'))
        .mockResolvedValue(undefined),
    };
    const scheduler = new AssetDirectorySyncSchedulerService(queue as never);
    const set = jest.fn().mockResolvedValue('OK');
    const reconciler = new WorkerScheduleReconcilerService(
      { getProviders: () => [{ instance: scheduler }] } as never,
      { getClient: () => ({ set }) } as never,
    );

    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    await expect(reconciler.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(reconciler.areSchedulesHealthy()).toBe(false);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(workerScheduleReconcileIntervalMs);

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(3);
    expect(reconciler.areSchedulesHealthy()).toBe(true);
    reconciler.onModuleDestroy();
  });

  it('does not fail worker startup on a temporary directory scheduler registration error and can retry', async () => {
    const queue = {
      upsertJobScheduler: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValue(undefined),
    };
    const scheduler = new AssetDirectorySyncSchedulerService(queue as never);

    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    await expect(scheduler.reconcileSchedule()).resolves.toBeUndefined();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith(
      assetDirectorySyncSchedulerId,
      { pattern: assetDirectorySyncCronPattern },
      {
        name: assetDirectorySyncJobName,
        data: {},
        opts: {
          attempts: assetDirectorySyncJobAttempts,
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 20 },
        },
      },
    );
  });

  it('keeps the reminder retry/backoff and cleanup policy during reconciliation', async () => {
    const queue = {
      upsertJobScheduler: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValue(undefined),
    };
    const scheduler = new AssetRemindersSchedulerService(queue as never);

    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    await expect(scheduler.reconcileSchedule()).resolves.toBeUndefined();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith(
      assetRemindersSchedulerId,
      { pattern: assetRemindersCronPattern },
      {
        name: assetRemindersJobName,
        data: {},
        opts: {
          attempts: assetRemindersJobAttempts,
          backoff: {
            type: 'exponential',
            delay: assetRemindersJobBackoffMilliseconds,
          },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 20 },
        },
      },
    );
  });
});
