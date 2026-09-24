import { Logger } from '@nestjs/common';
import {
  slaScanJobAttempts,
  slaScanJobName,
  slaScanRepeatEveryMilliseconds,
  slaScanSchedulerId,
} from './sla-scan.constants';
import { SlaScanSchedulerService } from './sla-scan.scheduler.service';

/**
 * Phase 2.1 (plan §2.1): the schedule lives in Redis, is idempotent by id, and
 * carries its own retry policy.
 */
describe('SlaScanSchedulerService', () => {
  it('registers a one-minute schedule with retries', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue({});
    const service = new SlaScanSchedulerService({
      upsertJobScheduler,
    } as never);

    await service.onModuleInit();

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeat, template] = upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toBe(slaScanSchedulerId);
    expect(repeat).toEqual({ every: slaScanRepeatEveryMilliseconds });
    expect(template.name).toBe(slaScanJobName);
    expect(template.opts.attempts).toBe(slaScanJobAttempts);
    expect(template.opts.backoff.type).toBe('exponential');
  });

  it('keeps the worker alive when the schedule cannot be registered', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const service = new SlaScanSchedulerService({
        upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis is down')),
      } as never);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(String(warn.mock.calls[0]?.[0])).toContain('sla_scan_schedule_failed');
    } finally {
      warn.mockRestore();
    }
  });
});
