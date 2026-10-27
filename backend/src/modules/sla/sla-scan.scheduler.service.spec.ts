import { Logger } from '@nestjs/common';
import {
  slaScanJobAttempts,
  slaScanJobName,
  slaScanRegistrationReconcileMilliseconds,
  slaScanRegistrationRetryBaseMilliseconds,
  slaScanRepeatEveryMilliseconds,
  slaScanSchedulerId,
} from './sla-scan.constants';
import { SlaScanSchedulerService } from './sla-scan.scheduler.service';

describe('SlaScanSchedulerService', () => {
  afterEach(() => jest.useRealTimers());

  it('registers a one-minute schedule with retries and reports ready', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue({});
    const service = new SlaScanSchedulerService({ upsertJobScheduler } as never);
    await service.onModuleInit();
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeat, template] = upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toBe(slaScanSchedulerId);
    expect(repeat).toEqual({ every: slaScanRepeatEveryMilliseconds });
    expect(template.name).toBe(slaScanJobName);
    expect(template.opts.attempts).toBe(slaScanJobAttempts);
    expect(template.opts.backoff.type).toBe('exponential');
    expect(service.getRegistrationHealth()).toMatchObject({ ready: true, consecutiveFailures: 0 });
    service.onModuleDestroy();
  });

  it('stays alive, exposes not-ready health, and self-heals with bounded backoff', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-27T12:00:00.000Z') });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const upsertJobScheduler = jest
      .fn()
      .mockRejectedValueOnce(new Error('redis is down'))
      .mockRejectedValueOnce(new Error('redis is still down'))
      .mockResolvedValue({});
    const service = new SlaScanSchedulerService({ upsertJobScheduler } as never);
    await service.onModuleInit();
    expect(service.getRegistrationHealth()).toMatchObject({
      ready: false,
      consecutiveFailures: 1,
      nextAttemptAt: new Date('2026-10-27T12:00:01.000Z'),
    });
    await jest.advanceTimersByTimeAsync(slaScanRegistrationRetryBaseMilliseconds);
    expect(service.getRegistrationHealth()).toMatchObject({ ready: false, consecutiveFailures: 2 });
    await jest.advanceTimersByTimeAsync(slaScanRegistrationRetryBaseMilliseconds * 2);
    expect(service.getRegistrationHealth()).toMatchObject({ ready: true, consecutiveFailures: 0 });
    expect(upsertJobScheduler).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    error.mockRestore();
  });

  it('periodically recreates a schedule deleted while the worker is alive', async () => {
    jest.useFakeTimers();
    const upsertJobScheduler = jest.fn().mockResolvedValue({});
    const service = new SlaScanSchedulerService({ upsertJobScheduler } as never);
    await service.onModuleInit();
    await jest.advanceTimersByTimeAsync(slaScanRegistrationReconcileMilliseconds);
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(slaScanRegistrationReconcileMilliseconds);
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
  });
});
