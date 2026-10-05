import type { Queue } from 'bullmq';
import {
  notificationDigestCronPattern,
  notificationDigestJobName,
  notificationDigestSchedulerId,
} from './notification-digest.constants';
import { NotificationDigestSchedulerService } from './notification-digest.scheduler.service';

/**
 * M13: the 5-minute digest schedule. Idempotent by scheduler id (so parallel
 * workers converge), and a Redis failure at boot must not stop the API.
 */
describe('NotificationDigestSchedulerService (M13)', () => {
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

  it('registers the digest pass', async () => {
    const { queue, calls } = createQueue();
    await new NotificationDigestSchedulerService(queue).onModuleInit();

    expect(calls).toHaveLength(1);
    const [schedulerId, repeat, job] = calls[0] as [
      string,
      { pattern: string },
      { name: string; opts: Record<string, unknown> },
    ];
    expect(schedulerId).toBe(notificationDigestSchedulerId);
    expect(repeat).toEqual({ pattern: notificationDigestCronPattern });
    expect(job.name).toBe(notificationDigestJobName);
    expect(job.opts).toMatchObject({
      attempts: 1,
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 20 },
    });
  });

  it('swallows a scheduling failure', async () => {
    const queue = {
      upsertJobScheduler: async () => {
        throw new Error('redis is down');
      },
    } as unknown as Queue;
    await expect(
      new NotificationDigestSchedulerService(queue).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
