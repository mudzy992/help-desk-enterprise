import {
  IntegrationWorkerMaintenanceSchedulerService,
  integrationWorkerMaintenanceReconcileIntervalMilliseconds,
} from "./integration-worker-maintenance.scheduler.service";
import {
  integrationDlqRetentionSchedulerId,
  integrationJobDispatchReconcileJobName,
  integrationJobDispatchReconcileRepeatEveryMilliseconds,
  integrationJobDispatchReconcileSchedulerId,
  integrationWorkerHeartbeatJobName,
  integrationWorkerHeartbeatRepeatEveryMilliseconds,
  integrationWorkerHeartbeatSchedulerId,
} from "./integration-worker-maintenance.job.constants";

function harness(
  upsertJobScheduler: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  const queue = { upsertJobScheduler };
  const settingsService = { getSetting: async () => null };
  const service = new IntegrationWorkerMaintenanceSchedulerService(
    queue as never,
    settingsService as never,
  );
  return { service, upsertJobScheduler };
}

const registeredIds = (calls: unknown[][]) => calls.map((call) => call[0]);

/*
  Incident 2026-10-17: `worker.down` opened with `heartbeatMissing: true` on a
  worker that was running. The periodic heartbeat is a BullMQ schedule that was
  registered exactly once, at boot, by `registerRepeatableJob` — which logs and
  moves on when Redis refuses it — and a Redis restart or flush drops the
  registration for good. Nothing ever re-asserted it, so the only way back was a
  redeploy of the worker. The schedule is now re-asserted on an interval;
  `upsertJobScheduler` is idempotent by scheduler id, so the registrations cannot
  double a job. The same self-heal loop also
  reasserts the DLQ retention and durable dispatch-reconcile schedules.
*/
describe("IntegrationWorkerMaintenanceSchedulerService", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("registers heartbeat, DLQ retention, and dispatch recovery at boot", async () => {
    const { service, upsertJobScheduler } = harness();
    await service.onModuleInit();
    expect(registeredIds(upsertJobScheduler.mock.calls)).toEqual([
      integrationWorkerHeartbeatSchedulerId,
      integrationDlqRetentionSchedulerId,
      integrationJobDispatchReconcileSchedulerId,
    ]);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      integrationWorkerHeartbeatSchedulerId,
      { every: integrationWorkerHeartbeatRepeatEveryMilliseconds },
      expect.objectContaining({ name: integrationWorkerHeartbeatJobName }),
    );
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      integrationJobDispatchReconcileSchedulerId,
      { every: integrationJobDispatchReconcileRepeatEveryMilliseconds },
      expect.objectContaining({ name: integrationJobDispatchReconcileJobName }),
    );
    service.onModuleDestroy();
  });

  it("re-asserts all schedules so a lost registration heals without a redeploy", async () => {
    const { service, upsertJobScheduler } = harness();
    await service.onModuleInit();
    expect(upsertJobScheduler).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(
      integrationWorkerMaintenanceReconcileIntervalMilliseconds,
    );
    expect(upsertJobScheduler).toHaveBeenCalledTimes(6);
    expect(registeredIds(upsertJobScheduler.mock.calls.slice(3))).toEqual([
      integrationWorkerHeartbeatSchedulerId,
      integrationDlqRetentionSchedulerId,
      integrationJobDispatchReconcileSchedulerId,
    ]);
    service.onModuleDestroy();
  });

  it("stops re-asserting after the module is destroyed", async () => {
    const { service, upsertJobScheduler } = harness();
    await service.onModuleInit();
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(
      integrationWorkerMaintenanceReconcileIntervalMilliseconds * 3,
    );
    expect(upsertJobScheduler).toHaveBeenCalledTimes(3);
  });

  it("fails startup when Redis refuses mandatory registration", async () => {
    const upsertJobScheduler = jest
      .fn()
      .mockRejectedValueOnce(new Error("Connection is closed"))
      .mockRejectedValueOnce(new Error("Connection is closed"))
      .mockResolvedValue(undefined);
    const { service } = harness(upsertJobScheduler);
    await expect(service.onModuleInit()).rejects.toThrow(
      "integration_worker_heartbeat mandatory schedule registration failed",
    );
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
