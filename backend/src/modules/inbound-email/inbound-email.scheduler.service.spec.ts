import {
  inboundEmailPollSchedulerId,
  inboundEmailRetentionSchedulerId,
} from './inbound-email.constants';
import { InboundEmailSchedulerService } from './inbound-email.scheduler.service';

function createService(schedulers: readonly { id: string }[]) {
  const queue = {
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    getJobSchedulers: jest.fn().mockResolvedValue(schedulers),
  };
  const service = new InboundEmailSchedulerService(queue as never);
  return { service, queue };
}

describe('InboundEmailSchedulerService schedule reconciliation (BA-inbound-email-08)', () => {
  it('restores both mandatory schedules after Redis loses them', async () => {
    const { service, queue } = createService([]);

    await expect(service.reconcileSchedules()).resolves.toEqual([
      inboundEmailPollSchedulerId,
      inboundEmailRetentionSchedulerId,
    ]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      inboundEmailPollSchedulerId,
      expect.objectContaining({ every: expect.any(Number) }),
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      inboundEmailRetentionSchedulerId,
      expect.objectContaining({ pattern: expect.any(String) }),
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it('restores only the missing schedule', async () => {
    const { service, queue } = createService([{ id: inboundEmailPollSchedulerId }]);

    await expect(service.reconcileSchedules()).resolves.toEqual([
      inboundEmailRetentionSchedulerId,
    ]);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
  });

  it('does nothing while both schedules exist', async () => {
    const { service, queue } = createService([
      { id: inboundEmailPollSchedulerId },
      { id: inboundEmailRetentionSchedulerId },
    ]);

    await expect(service.reconcileSchedules()).resolves.toEqual([]);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
