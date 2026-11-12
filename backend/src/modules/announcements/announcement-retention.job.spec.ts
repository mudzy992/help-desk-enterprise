jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../audit-log/append-audit-log', () => ({ appendAuditLog: jest.fn(async () => undefined) }));

import { AnnouncementRetentionProcessor } from './announcement-retention.processor';
import { AnnouncementRetentionSchedulerService } from './announcement-retention.scheduler.service';
import type { AnnouncementsService } from './announcements.service';

describe('BA-announcements-17 retention job', () => {
  it('runs retention and completes when the service succeeds', async () => {
    const service = { runRetention: jest.fn(async () => 7) };
    const processor = new AnnouncementRetentionProcessor(service as unknown as AnnouncementsService);
    await expect(processor.process()).resolves.toBeUndefined();
    expect(service.runRetention).toHaveBeenCalledTimes(1);
  });

  it('fails the job when retention fails (so BullMQ retries)', async () => {
    const service = {
      runRetention: jest.fn(async () => {
        throw new Error('retention failed');
      }),
    };
    const processor = new AnnouncementRetentionProcessor(service as unknown as AnnouncementsService);
    await expect(processor.process()).rejects.toThrow('retention failed');
  });

  it('scheduler registers at startup and self-heals a lost scheduler', async () => {
    const queue = {
      upsertJobScheduler: jest.fn(async () => undefined),
      getJobSchedulers: jest.fn(async () => [] as unknown[]),
    };
    const scheduler = new AnnouncementRetentionSchedulerService(queue as never);
    await scheduler.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    await expect(scheduler.reconcileSchedule()).resolves.toEqual(['announcement-retention-hourly']);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    queue.getJobSchedulers.mockResolvedValue([{ id: 'announcement-retention-hourly' }]);
    await expect(scheduler.reconcileSchedule()).resolves.toEqual([]);
    scheduler.onModuleDestroy();
  });
});
