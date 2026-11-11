import { Logger } from '@nestjs/common';
import { announcementSweepSchedulerId } from './announcement-sweep.job.constants';
import { AnnouncementSweepSchedulerService } from './announcement-sweep.scheduler.service';

function setup(schedulers: readonly { id?: string | null }[]) {
  const queue = {
    upsertJobScheduler: jest.fn(async () => ({})),
    getJobSchedulers: jest.fn(async () => schedulers),
  };
  const service = new AnnouncementSweepSchedulerService(queue as never);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  return { service, queue, warn };
}

describe('AnnouncementSweepSchedulerService reconciliation (BA-announcements-11)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers the sweep schedule on module init', async () => {
    const { service, queue } = setup([]);
    await service.onModuleInit();
    service.onModuleDestroy();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      announcementSweepSchedulerId,
      expect.objectContaining({ pattern: expect.any(String) }),
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it('restores the scheduler when Redis lost it and logs the recovery', async () => {
    const { service, queue, warn } = setup([]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([announcementSweepSchedulerId]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('announcement_sweep_schedule_recovered'));
  });

  it('does nothing when the scheduler is still present', async () => {
    const { service, queue } = setup([{ id: announcementSweepSchedulerId }]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([]);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
