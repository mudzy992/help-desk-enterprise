import { IntegrationQueueWorkerHeartbeatService } from './integration-queue-worker-heartbeat.service';
import { workerHeartbeatRedisKey } from './integration-queue.constants';

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
      30,
    );
  });
});
