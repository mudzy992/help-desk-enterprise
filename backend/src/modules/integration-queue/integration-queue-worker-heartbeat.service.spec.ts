import { IntegrationQueueWorkerHeartbeatService } from './integration-queue-worker-heartbeat.service';
import {
  workerHeartbeatRedisKey,
  workerHeartbeatStaleThresholdMilliseconds,
  workerHeartbeatTimeToLiveSeconds,
} from './integration-queue.constants';

describe('IntegrationQueueWorkerHeartbeatService', () => {
  it('writes an ISO heartbeat timestamp to Redis with TTL', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const redisService = {
      getClient: () => ({ set }),
    };
    const service = new IntegrationQueueWorkerHeartbeatService(
      redisService as never,
    );
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
});
