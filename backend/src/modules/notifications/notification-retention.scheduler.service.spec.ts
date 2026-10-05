import type { Queue } from 'bullmq';
import {
  notificationRetentionCronPattern,
  notificationRetentionJobAttempts,
  notificationRetentionJobBackoffMilliseconds,
  notificationRetentionJobName,
  notificationRetentionSchedulerId,
} from './notification-retention.constants';
import { NotificationRetentionSchedulerService } from './notification-retention.scheduler.service';

/**
 * M13 (val 4/5): this service had no spec. It only registers the daily sweep,
 * so the test is about the registration being idempotent by id and about a
 * broken Redis not taking the worker down at start-up.
 */
describe('NotificationRetentionSchedulerService (M13)', () => {
  function createQueue() {
    const calls: unknown[][] = [];
    const queue = {
      upsertJobScheduler: async (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
    } as unknown as Queue;
    return { queue, calls };
  }

  it('registers the daily sweep with its retry policy', async () => {
    const { queue, calls } = createQueue();
    const service = new NotificationRetentionSchedulerService(queue);

    await service.onModuleInit();

    expect(calls).toHaveLength(1);
    const [schedulerId, repeat, job] = calls[0] as [
      string,
      { pattern: string },
      { name: string; data: unknown; opts: Record<string, unknown> },
    ];
    expect(schedulerId).toBe(notificationRetentionSchedulerId);
    expect(repeat).toEqual({ pattern: notificationRetentionCronPattern });
    expect(job.name).toBe(notificationRetentionJobName);
    expect(job.data).toEqual({});
    expect(job.opts).toMatchObject({
      attempts: notificationRetentionJobAttempts,
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 20 },
    });
    expect(job.opts.backoff).toEqual({
      type: 'exponential',
      delay: notificationRetentionJobBackoffMilliseconds,
    });
  });

  it('only warns when the scheduler cannot be registered', async () => {
    const queue = {
      upsertJobScheduler: async () => {
        throw new Error('redis is down');
      },
    } as unknown as Queue;
    const service = new NotificationRetentionSchedulerService(queue);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
