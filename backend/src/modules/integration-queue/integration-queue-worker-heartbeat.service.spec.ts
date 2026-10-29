import { IntegrationQueueWorkerHeartbeatService } from './integration-queue-worker-heartbeat.service';
import {
  workerHeartbeatIntervalMilliseconds,
  workerHeartbeatRedisKey,
  workerHeartbeatStaleThresholdMilliseconds,
  workerHeartbeatTimeToLiveSeconds,
} from './integration-queue.constants';

function harness(set: jest.Mock = jest.fn().mockResolvedValue('OK')) {
  const redisService = { getClient: () => ({ set }) };
  return {
    set,
    service: new IntegrationQueueWorkerHeartbeatService(redisService as never),
  };
}

describe('IntegrationQueueWorkerHeartbeatService', () => {
  it('writes an ISO heartbeat timestamp to Redis with TTL', async () => {
    const { set, service } = harness();
    await service.writeHeartbeat();
    expect(set).toHaveBeenCalledWith(
      workerHeartbeatRedisKey,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      'EX',
      workerHeartbeatTimeToLiveSeconds,
    );
  });

  /*
    Incident 2026-10-16: the key expired after 90 s while `worker.down` only
    fires above 120 s. A dead worker therefore left *no* key, and "no key" is
    also what a booting stack, an evicted key or a failed read looks like — the
    watchdog had no way to tell them apart and paged CRITICAL on a fresh
    install. The TTL must outlive the alarm threshold, so that death shows up
    as a heartbeat that is present and old.
  */
  it('keeps the key longer than the alarm threshold, so a dead worker reads as stale', () => {
    expect(workerHeartbeatTimeToLiveSeconds * 1_000).toBeGreaterThan(
      workerHeartbeatStaleThresholdMilliseconds,
    );
  });

  /*
    Incident 2026-10-17: the alarm came back with `heartbeatMissing: true` on a
    worker that was up. The periodic write is a BullMQ schedule registered once
    at boot (`registerRepeatableJob` only logs a failure) and served by a
    `concurrency: 1` processor shared with the DLQ sweep — lose the registration
    or stall the sweep and the key expires while the process is alive. The
    process therefore also writes it itself.
  */
  describe('the process-owned timer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    it('writes at boot and keeps writing without the queue schedule', async () => {
      const { set, service } = harness();
      await service.onModuleInit();
      expect(set).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds);
      expect(set).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds * 2);
      expect(set).toHaveBeenCalledTimes(4);
      expect(set).toHaveBeenLastCalledWith(
        workerHeartbeatRedisKey,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        'EX',
        workerHeartbeatTimeToLiveSeconds,
      );

      service.onModuleDestroy();
    });

    it('stops writing after the module is destroyed', async () => {
      const { set, service } = harness();
      await service.onModuleInit();
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds * 3);
      expect(set).toHaveBeenCalledTimes(1);
    });

    it('survives a Redis that refuses the write and tries again next tick', async () => {
      const set = jest
        .fn()
        .mockRejectedValueOnce(new Error('WRONGPASS'))
        .mockRejectedValueOnce(new Error('Connection is closed'))
        .mockResolvedValue('OK');
      const { service } = harness(set);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds);
      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds);
      expect(set).toHaveBeenCalledTimes(3);
      service.onModuleDestroy();
    });

    it('does not register the timer twice when init runs again', async () => {
      const { set, service } = harness();
      await service.onModuleInit();
      await service.onModuleInit();
      await jest.advanceTimersByTimeAsync(workerHeartbeatIntervalMilliseconds);
      // Two immediate writes (one per init) plus one tick — not two ticks.
      expect(set).toHaveBeenCalledTimes(3);
      service.onModuleDestroy();
    });
  });
});
