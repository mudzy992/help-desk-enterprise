import {
  reportSchedulesCronPattern,
  reportSchedulesQueueName,
  reportSchedulesReconcileMilliseconds,
  reportSchedulesSchedulerId,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';
import { ReportSchedulesSchedulerService } from './report-schedules.scheduler.service';

/**
 * W7.98 (`BA-reports-08`): the five-minute report sweep was registered once at boot and never checked again. Its
 * registration lives in Redis, so a restart without persistence, a `FLUSHALL`, a failover to an empty instance or
 * a restore of an older snapshot deleted it — and scheduled report e-mail simply stopped, silently, until the next
 * deploy. The service now re-asserts its own schedule and says when it had to restore it.
 */
describe('ReportSchedulesSchedulerService', () => {
  // BullMQ 5.81 puts a modern scheduler's id in `key` and leaves `id` unset; the legacy shape carries it in `id`.
  function createQueue(present: boolean, entry: { key?: string; id?: string } = { key: reportSchedulesSchedulerId }) {
    const queue = {
      upsertJobScheduler: jest.fn(async () => ({})),
      getJobSchedulers: jest.fn(async () => (present ? [entry] : [])),
    };
    return queue;
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers the five-minute sweep on init with the shared registration contract', async () => {
    const queue = createQueue(true);
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
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
      expect(reportSchedulesQueueName).toBe('report-schedules');
    } finally {
      service.onModuleDestroy();
    }
  });

  it('leaves a schedule that Redis still has alone', async () => {
    const queue = createQueue(true);
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).resolves.toEqual([]);
      // Only the boot registration; the reconcile added nothing.
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('accepts a legacy repeatable entry that carries the id in `id`', async () => {
    const queue = createQueue(true, {
      key: `${reportSchedulesSweepJobName}:${reportSchedulesSchedulerId}:0::*/5 * * * *`,
      id: reportSchedulesSchedulerId,
    });
    const service = new ReportSchedulesSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).resolves.toEqual([]);
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('restores the sweep after a Redis flush and reports what it restored', async () => {
    const queue = createQueue(false);
    const service = new ReportSchedulesSchedulerService(queue as never);
    const warn = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      await expect(service.reconcileSchedule()).resolves.toEqual([reportSchedulesSchedulerId]);
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(`report_schedules_schedule_recovered id=${reportSchedulesSchedulerId}`);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('reconciles on its own timer and stops when the module is destroyed', async () => {
    jest.useFakeTimers();
    const queue = createQueue(false);
    const service = new ReportSchedulesSchedulerService(queue as never);
    await service.onModuleInit();
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds);
    // The timer fires `void reconcileSchedule()`; let the promises settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    jest.advanceTimersByTime(reportSchedulesReconcileMilliseconds * 3);
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
  });

  it('does not start a second timer when init is called twice', async () => {
    jest.useFakeTimers();
    const queue = createQueue(true);
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
    const queue = createQueue(true);
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
    const queue = createQueue(true);
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
