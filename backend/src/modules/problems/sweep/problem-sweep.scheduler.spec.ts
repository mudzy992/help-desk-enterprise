import { Logger } from '@nestjs/common';
import {
  problemSweepJobName,
  problemSweepSchedulerId,
} from './problem-sweep.constants';
import { ProblemSweepSchedulerService } from './problem-sweep.scheduler.service';

function setup(schedulers: readonly { id?: string | null }[]) {
  const queue = {
    upsertJobScheduler: jest.fn(async () => ({})),
    getJobSchedulers: jest.fn(async () => schedulers),
  };
  const service = new ProblemSweepSchedulerService(queue as never);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  return { service, queue, warn, error };
}

describe('ProblemSweepSchedulerService reconciliation (BA-problems-14)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('registers the hourly sweep on module init and stops the timer on destroy', async () => {
    jest.useFakeTimers();
    const { service, queue } = setup([]);
    await service.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      problemSweepSchedulerId,
      expect.objectContaining({ pattern: '23 * * * *' }),
      expect.objectContaining({ name: problemSweepJobName }),
    );
    service.onModuleDestroy();
    // A destroyed timer must not keep reconciling.
    await jest.advanceTimersByTimeAsync(3 * 60_000);
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();
  });

  it('restores the schedule after Redis lost it and logs the recovery', async () => {
    const { service, queue, warn } = setup([]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([problemSweepSchedulerId]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('problem_sweep_schedule_recovered'));
  });

  it('does nothing while the schedule is still registered', async () => {
    const { service, queue } = setup([{ id: problemSweepSchedulerId }]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([]);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('keeps the recovery attempt going when registering fails once', async () => {
    jest.useFakeTimers();
    const { service, queue, error } = setup([]);
    await service.onModuleInit();
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('problem_sweep_schedule_reconcile_failed'),
    );
    // The next minute tries again and succeeds — the schedule is back.
    queue.upsertJobScheduler.mockResolvedValue({});
    await jest.advanceTimersByTimeAsync(60_000);
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(3);
    service.onModuleDestroy();
  });

  it('fails the boot when the mandatory schedule cannot be registered', async () => {
    const { service, queue } = setup([]);
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.onModuleInit()).rejects.toThrow(
      /problem_sweep mandatory schedule registration failed/,
    );
    service.onModuleDestroy();
  });
});
