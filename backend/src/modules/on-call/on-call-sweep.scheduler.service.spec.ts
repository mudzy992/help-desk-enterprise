import { OnCallSweepSchedulerService } from './on-call-sweep.scheduler.service';
import { onCallSweepSchedulerId } from './on-call-sweep.job.constants';

function queueFake(schedulers: readonly { id: string }[]) {
  return {
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    getJobSchedulers: jest.fn().mockResolvedValue(schedulers),
  };
}

describe('OnCallSweepSchedulerService reconciliation (BA-on-call-09)', () => {
  it('does nothing while the sweep scheduler exists in Redis', async () => {
    const queue = queueFake([{ id: onCallSweepSchedulerId }]);
    const service = new OnCallSweepSchedulerService(queue as never);
    await expect(service.reconcileSchedules()).resolves.toEqual([]);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('restores the sweep scheduler after Redis loses it', async () => {
    const queue = queueFake([]);
    const service = new OnCallSweepSchedulerService(queue as never);
    await expect(service.reconcileSchedules()).resolves.toEqual([onCallSweepSchedulerId]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler.mock.calls[0]?.[0]).toBe(onCallSweepSchedulerId);
  });

  it('registers on init and cleans up its timer on destroy', async () => {
    const queue = queueFake([]);
    const service = new OnCallSweepSchedulerService(queue as never);
    await service.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
