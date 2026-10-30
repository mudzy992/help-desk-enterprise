import {
  WorkerScheduleReconcilerService,
  workerScheduleReconcileIntervalMs,
} from './worker-schedule-reconciler.service';

function harness(schedulers: object[]) {
  const set = jest.fn().mockResolvedValue('OK');
  const service = new WorkerScheduleReconcilerService(
    { getProviders: () => schedulers.map((instance) => ({ instance })) } as never,
    { getClient: () => ({ set }) } as never,
  );
  return { service, set };
}

class RequiredSchedulerService {
  onModuleInit = jest.fn().mockResolvedValue(undefined);
}

class RetryableSchedulerService extends RequiredSchedulerService {
  reconcileSchedule = jest
    .fn<Promise<void>, []>()
    .mockRejectedValueOnce(new Error('temporary Redis outage'))
    .mockResolvedValue(undefined);
}

describe('WorkerScheduleReconcilerService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reasserts every discovered mandatory scheduler', async () => {
    const first = new RequiredSchedulerService();
    const second = new RequiredSchedulerService();
    const { service } = harness([first, second, { onModuleInit: jest.fn() }]);
    await service.reconcile();
    expect(first.onModuleInit).toHaveBeenCalledTimes(1);
    expect(second.onModuleInit).toHaveBeenCalledTimes(1);
    expect(service.areSchedulesHealthy()).toBe(true);
  });

  it('keeps the periodic retry armed after the eager reconciliation fails', async () => {
    jest.useFakeTimers();
    const scheduler = new RetryableSchedulerService();
    const { service } = harness([scheduler]);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(scheduler.reconcileSchedule).toHaveBeenCalledTimes(1);
    expect(service.areSchedulesHealthy()).toBe(false);

    await jest.advanceTimersByTimeAsync(workerScheduleReconcileIntervalMs);
    expect(scheduler.reconcileSchedule).toHaveBeenCalledTimes(2);
    expect(service.areSchedulesHealthy()).toBe(true);
    service.onModuleDestroy();
  });

  it('marks readiness degraded when any scheduler cannot reconcile', async () => {
    const scheduler = new RequiredSchedulerService();
    scheduler.onModuleInit.mockRejectedValue(new Error('credential must not be logged'));
    const { service, set } = harness([scheduler]);
    await expect(service.reconcile()).rejects.toThrow();
    expect(service.areSchedulesHealthy()).toBe(false);
    expect(set).toHaveBeenCalledWith('worker:lifecycle', expect.stringContaining('"state":"degraded"'), 'EX', 120);
  });
});
