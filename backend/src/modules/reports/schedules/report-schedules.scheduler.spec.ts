import {
  reportSchedulesCronPattern,
  reportSchedulesQueueName,
  reportSchedulesReconcileMilliseconds,
  reportSchedulesRetentionCronPattern,
  reportSchedulesRetentionJobAttempts,
  reportSchedulesRetentionJobName,
  reportSchedulesRetentionSchedulerId,
  reportSchedulesSchedulerId,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';
import { ReportSchedulesSchedulerService } from './report-schedules.scheduler.service';

/**
 * W7.98 (`BA-reports-08`): the five-minute report sweep was registered once at boot and never checked again. Its
 * registration lives in Redis, so a restart without persistence, a `FLUSHALL`, a failover to an empty instance or
 * a restore of an older snapshot deleted it — and scheduled report e-mail simply stopped, silently, until the next
 * deploy. The service now re-asserts its own schedule and says when it had to restore it.
 *
 * W7.103 (`BA-reports-14`): the queue owns a second schedule — the daily run-log retention. Reconcile has to look
 * at both, otherwise the retention registration could be lost forever while the sweep looks healthy.
 */
describe('ReportSchedulesSchedulerService', () => {
  // BullMQ 5.81 puts a modern scheduler's id in `key` and leaves `id` unset; the legacy shape carries it in `id`.
  const bothSchedules = [reportSchedulesSchedulerId, reportSchedulesRetentionSchedulerId] as const;

  /** The timer's promise chain awaits one registration per missing schedule; drain it before asserting. */
  async function settleMicrotasks(): Promise<void> {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  }

  function createQueue(
    registered: readonly string[] = bothSchedules,
    entries: readonly { key?: string; id?: string }[] = registered.map((key) => ({ key })),
  ) {
    const queue = {
      upsertJobScheduler: jest.fn(async () => ({})),
      getJobSchedulers: jest.fn(async () => [...entries]),
    };
    return queue;
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers the five-minute sweep and the daily retention on init', async () => {
    const queue = createQueue();
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      const [schedulerId, repeat, template] = queue.upsertJobScheduler.mock.calls[0] as unknown as [
        string,
        { pattern: string },
        { name: string; data: Record<string, unknown>; opts: Record<string, unknown> },
      ];
      expect(schedulerId).toBe(reportSchedulesSchedulerId);
      expect(repeat).toEqual({ pattern: reportSchedulesCronPattern });
      expect(template.name).toBe(reportSchedulesSweepJobName);
      // Same delivery policy the sweep had before the schedule became self-healing: one attempt, bounded DLQ.
      expect(template.opts).toMatchObject({
        attempts: 1,
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 20 },
      });
      // W7.103: retention is a separate job, so it can retry without competing with the sweep for a slot.
      const [retentionId, retentionRepeat, retentionTemplate] = queue.upsertJobScheduler.mock
        .calls[1] as unknown as [
        string,
        { pattern: string },
        { name: string; opts: Record<string, unknown> },
      ];
      expect(retentionId).toBe(reportSchedulesRetentionSchedulerId);
      expect(retentionRepeat).toEqual({ pattern: reportSchedulesRetentionCronPattern });
      expect(retentionTemplate.name).toBe(reportSchedulesRetentionJobName);
      expect(retentionTemplate.opts).toMatchObject({
        attempts: reportSchedulesRetentionJobAttempts,
      });
      expect(reportSchedulesQueueName).toBe('report-schedules');
    } finally {
      service.onModuleDestroy();
    }
  });

  it('leaves schedules that Redis still has alone', async () => {
    const queue = createQueue();
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).resolves.toEqual([]);
      // Only the boot registrations; the reconcile added nothing.
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('restores only the retention schedule when the sweep is still registered (W7.103)', async () => {
    const queue = createQueue([reportSchedulesSchedulerId]);
    const service = new ReportSchedulesSchedulerService(queue as never);
    const warn = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).resolves.toEqual([
        reportSchedulesRetentionSchedulerId,
      ]);
      // Two at boot plus the one restored schedule, and the sweep was not re-registered.
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(3);
      expect(queue.upsertJobScheduler.mock.calls[2]?.[0]).toBe(
        reportSchedulesRetentionSchedulerId,
      );
      expect(warn).toHaveBeenCalledWith(
        `report_schedules_schedule_recovered id=${reportSchedulesRetentionSchedulerId}`,
      );
    } finally {
      service.onModuleDestroy();
    }
  });

  it('accepts a legacy repeatable entry that carries the id in `id`', async () => {
    const queue = createQueue(bothSchedules, [
      {
        key: `${reportSchedulesSweepJobName}:${reportSchedulesSchedulerId}:0::*/5 * * * *`,
        id: reportSchedulesSchedulerId,
      },
      { key: reportSchedulesRetentionSchedulerId },
    ]);
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).resolves.toEqual([]);
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('restores both schedules after a Redis flush and reports what it restored', async () => {
    const queue = createQueue([]);
    const service = new ReportSchedulesSchedulerService(queue as never);
    const warn = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      await expect(service.reconcileSchedule()).resolves.toEqual([
        reportSchedulesSchedulerId,
        reportSchedulesRetentionSchedulerId,
      ]);
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(4);
      expect(warn).toHaveBeenCalledWith(`report_schedules_schedule_recovered id=${reportSchedulesSchedulerId}`);
      expect(warn).toHaveBeenCalledWith(
        `report_schedules_schedule_recovered id=${reportSchedulesRetentionSchedulerId}`,
      );
    } finally {
      service.onModuleDestroy();
    }
  });

  it('reconciles on its own timer and stops when the module is destroyed', async () => {
    jest.useFakeTimers();
    const queue = createQueue([]);
    const service = new ReportSchedulesSchedulerService(queue as never);
    await service.onModuleInit();
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds);
    // The timer fires `void reconcileSchedule()`; let the promises settle (two registrations now).
    await settleMicrotasks();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
    // Two at boot plus the two the timer restored.
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(4);

    service.onModuleDestroy();
    jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds * 3);
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
  });

  it('does not start a second timer when init is called twice', async () => {
    jest.useFakeTimers();
    const queue = createQueue();
    const service = new ReportSchedulesSchedulerService(queue as never);
    await service.onModuleInit();
    await service.onModuleInit();
    jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('logs a failed reconcile to the timer and keeps running', async () => {
    const queue = createQueue();
    queue.getJobSchedulers.mockRejectedValueOnce(new Error('redis down'));
    const service = new ReportSchedulesSchedulerService(queue as never);
    const error = jest.spyOn(
      (service as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    );
    jest.useFakeTimers();
    try {
      await service.onModuleInit();
      jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(error).toHaveBeenCalledWith('report_schedules_schedule_reconcile_failed type=Error');
      // The next tick still asks Redis: one unreachable minute is not a reason to stop healing.
      jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(queue.getJobSchedulers).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('keeps the failure of a manual reconcile visible to the caller', async () => {
    const queue = createQueue();
    queue.getJobSchedulers.mockRejectedValueOnce(new Error('redis down'));
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).rejects.toThrow('redis down');
    } finally {
      service.onModuleDestroy();
    }
  });
});
