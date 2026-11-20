import { Logger } from "@nestjs/common";
import {
  changeSweepJobName,
  changeSweepReconcileMilliseconds,
  changeSweepSchedulerId,
} from "./change-sweep.constants";
import { ChangeSweepSchedulerService } from "./change-sweep.scheduler.service";

function setup(schedulers: readonly { id?: string | null }[]) {
  const queue = {
    upsertJobScheduler: jest.fn(async () => ({})),
    getJobSchedulers: jest.fn(async () => schedulers),
  };
  const service = new ChangeSweepSchedulerService(queue as never);
  const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  return { service, queue, warn, error };
}

describe("ChangeSweepSchedulerService reconciliation (BA-changes-13)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("registers the quarter-hourly sweep on module init and stops the timer on destroy", async () => {
    jest.useFakeTimers();
    const { service, queue } = setup([]);
    await service.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      changeSweepSchedulerId,
      expect.objectContaining({ pattern: "*/15 * * * *" }),
      expect.objectContaining({ name: changeSweepJobName }),
    );
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(3 * 60_000);
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();
  });

  it("restores the schedule after Redis lost it and logs the recovery", async () => {
    const { service, queue, warn } = setup([]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([changeSweepSchedulerId]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("change_sweep_schedule_recovered"));
  });

  it("does nothing while the schedule is still registered", async () => {
    const { service, queue } = setup([{ id: changeSweepSchedulerId }]);
    const restored = await service.reconcileSchedule();
    expect(restored).toEqual([]);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("keeps the recovery attempt going when registering fails once", async () => {
    jest.useFakeTimers();
    const { service, queue, error } = setup([]);
    await service.onModuleInit();
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error("redis down"));
    await jest.advanceTimersByTimeAsync(changeSweepReconcileMilliseconds);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("change_sweep_schedule_reconcile_failed"),
    );
    queue.upsertJobScheduler.mockResolvedValue({});
    await jest.advanceTimersByTimeAsync(changeSweepReconcileMilliseconds);
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(3);
    service.onModuleDestroy();
  });

  it("fails the boot when the mandatory schedule cannot be registered", async () => {
    const { service, queue } = setup([]);
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error("redis down"));
    await expect(service.onModuleInit()).rejects.toThrow(
      /change_sweep mandatory schedule registration failed/,
    );
    service.onModuleDestroy();
  });
});
