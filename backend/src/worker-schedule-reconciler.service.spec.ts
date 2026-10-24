import { WorkerScheduleReconcilerService } from './worker-schedule-reconciler.service';

function harness(schedulers: object[]) {
  const set = jest.fn().mockResolvedValue('OK');
  const service = new WorkerScheduleReconcilerService(
    { getProviders: () => schedulers.map((instance) => ({ instance })) } as never,
    { getClient: () => ({ set }) } as never,
  );
  return { service, set };
}

class RequiredSchedulerService { onModuleInit = jest.fn().mockResolvedValue(undefined); }

describe('WorkerScheduleReconcilerService', () => {
  it('reasserts every discovered mandatory scheduler', async () => {
    const first = new RequiredSchedulerService();
    const second = new RequiredSchedulerService();
    const { service } = harness([first, second, { onModuleInit: jest.fn() }]);
    await service.reconcile();
    expect(first.onModuleInit).toHaveBeenCalledTimes(1);
    expect(second.onModuleInit).toHaveBeenCalledTimes(1);
  });

  it('marks readiness degraded when any scheduler cannot reconcile', async () => {
    const scheduler = new RequiredSchedulerService();
    scheduler.onModuleInit.mockRejectedValue(new Error('credential must not be logged'));
    const { service, set } = harness([scheduler]);
    await expect(service.reconcile()).rejects.toThrow();
    expect(set).toHaveBeenCalledWith('worker:lifecycle', expect.stringContaining('"state":"degraded"'), 'EX', 120);
  });
});
