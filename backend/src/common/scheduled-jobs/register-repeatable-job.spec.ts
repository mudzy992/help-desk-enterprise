import { registerRepeatableJob } from './register-repeatable-job';

function createRegistration(overrides: Record<string, unknown> = {}) {
  const upsertJobScheduler = jest.fn().mockResolvedValue({});
  return {
    upsertJobScheduler,
    registration: {
      queue: { upsertJobScheduler },
      schedulerId: 'ticket-archive-quarter-hourly',
      jobName: 'ticket-archive-scan',
      label: 'ticket_archive',
      schedule: { kind: 'pattern', pattern: '0 0,15,30,45 * * * *' },
      attempts: 2,
      backoffMilliseconds: 30_000,
      completedJobsToKeep: 20,
      failedJobsToKeep: 50,
      logger: { warn: jest.fn() },
      ...overrides,
    } as never,
  };
}

describe('registerRepeatableJob', () => {
  it('registers one idempotent schedule with timeout, retries and keep-counts', async () => {
    const { upsertJobScheduler, registration } = createRegistration();

    await registerRepeatableJob(registration);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeat, template] = upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toBe('ticket-archive-quarter-hourly');
    expect(repeat).toEqual({ pattern: '0 0,15,30,45 * * * *' });
    expect(template.name).toBe('ticket-archive-scan');
    expect(template.opts.attempts).toBe(2);
    expect(template.opts.backoff).toEqual({ type: 'exponential', delay: 30_000 });
    expect(template.opts.removeOnComplete).toEqual({ count: 20 });
    expect(template.opts.removeOnFail).toEqual({ count: 50 });
  });

  it('supports an interval schedule', async () => {
    const { upsertJobScheduler, registration } = createRegistration({
      schedule: { kind: 'every', milliseconds: 30_000 },
    });

    await registerRepeatableJob(registration);

    expect(upsertJobScheduler.mock.calls[0]?.[1]).toEqual({ every: 30_000 });
  });

  it('keeps the worker alive when the schedule cannot be registered', async () => {
    const logger = { warn: jest.fn() };
    const { registration } = createRegistration({
      logger,
      queue: {
        upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis is down')),
      },
    });

    await expect(registerRepeatableJob(registration)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'ticket_archive_schedule_failed reason=redis is down',
    );
  });
});
