import {
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderQueueName,
  knowledgeBaseReviewReminderReconcileMilliseconds,
  knowledgeBaseReviewReminderSchedulePattern,
  knowledgeBaseReviewReminderSchedulerId,
} from './knowledge-base-review-reminder.job.constants';
import { KnowledgeBaseReviewReminderSchedulerService } from './knowledge-base-review-reminder.scheduler.service';

/**
 * W7.86 (`BA-knowledge-base-13`): the sweep schedule was written once at boot. A
 * Redis restart, flush or failover to an empty instance deleted it and the worker
 * kept running happily — no reminders, and the view counters (8-day TTL) quietly
 * marching toward loss. The service now re-asserts its own schedule and says when
 * it had to restore it.
 */
describe('KnowledgeBaseReviewReminderSchedulerService', () => {
  // BullMQ 5.81 puts a modern scheduler's id in `key` and leaves `id` unset — the
  // shape the CI acceptance spec caught this service assuming wrong.
  function createQueue(present: boolean, entry = { key: knowledgeBaseReviewReminderSchedulerId }) {
    const queue = {
      upsertJobScheduler: jest.fn(async () => ({})),
      getJobSchedulers: jest.fn(async () => (present ? [entry] : [])),
    };
    return queue;
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers the quarter-hourly sweep on init with the shared registration contract', async () => {
    const queue = createQueue(true);
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      const [schedulerId, repeat, template] = queue.upsertJobScheduler.mock.calls[0] as unknown as [
        string,
        { pattern: string },
        { name: string },
      ];
      expect(schedulerId).toBe(knowledgeBaseReviewReminderSchedulerId);
      expect(repeat).toEqual({ pattern: knowledgeBaseReviewReminderSchedulePattern });
      expect(template.name).toBe(knowledgeBaseReviewReminderJobName);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('leaves a schedule that Redis still has alone', async () => {
    const queue = createQueue(true);
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
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
      key: `${knowledgeBaseReviewReminderJobName}:${knowledgeBaseReviewReminderSchedulerId}:0::0 10,25,40,55 * * * *`,
      id: knowledgeBaseReviewReminderSchedulerId,
    });
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
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
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    const warn = jest.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );
    try {
      await service.onModuleInit();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      await expect(service.reconcileSchedule()).resolves.toEqual([
        knowledgeBaseReviewReminderSchedulerId,
      ]);
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(
        `kb_review_reminder_schedule_recovered id=${knowledgeBaseReviewReminderSchedulerId}`,
      );
      expect(knowledgeBaseReviewReminderQueueName).toBe('knowledge-base-review-reminder');
    } finally {
      service.onModuleDestroy();
    }
  });

  it('reconciles on its own timer and stops when the module is destroyed', async () => {
    jest.useFakeTimers();
    const queue = createQueue(false);
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    await service.onModuleInit();
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();

    jest.advanceTimersByTime(knowledgeBaseReviewReminderReconcileMilliseconds);
    // The timer fires `void reconcileSchedule()`; let the promises settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
    jest.advanceTimersByTime(knowledgeBaseReviewReminderReconcileMilliseconds * 3);
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
  });

  it('does not start a second timer when init is called twice', async () => {
    jest.useFakeTimers();
    const queue = createQueue(true);
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    await service.onModuleInit();
    await service.onModuleInit();
    jest.advanceTimersByTime(knowledgeBaseReviewReminderReconcileMilliseconds);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getJobSchedulers).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('keeps the failure of a reconcile visible to the caller so the timer can log it', async () => {
    const queue = createQueue(true);
    queue.getJobSchedulers.mockRejectedValueOnce(new Error('redis down'));
    const service = new KnowledgeBaseReviewReminderSchedulerService(queue as never);
    try {
      await service.onModuleInit();
      await expect(service.reconcileSchedule()).rejects.toThrow('redis down');
    } finally {
      service.onModuleDestroy();
    }
  });
});
