import { edgeEventRedisChannel } from './integration-queue.constants';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

describe('PublishEdgeEventToRedisService', () => {
  it('returns Redis PUBLISH subscriber count', async () => {
    const redis = {
      status: 'wait',
      connect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(2),
    };
    const service = new PublishEdgeEventToRedisService(redis as never);
    const payload = {
      userId: 'user-1',
      ticketId: 'ticket-1',
      eventName: 'ticket.updated',
      data: { test: true },
    };

    await expect(service.publish(payload)).resolves.toBe(2);

    expect(redis.connect).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(
      edgeEventRedisChannel,
      JSON.stringify(payload),
    );
  });

  it('preserves a zero-subscriber result for the caller to classify', async () => {
    const redis = {
      status: 'ready',
      connect: jest.fn(),
      publish: jest.fn().mockResolvedValue(0),
    };
    const service = new PublishEdgeEventToRedisService(redis as never);

    await expect(
      service.publish({
        userId: 'user-1',
        eventName: 'ticket.updated',
        data: null,
      }),
    ).resolves.toBe(0);
    expect(redis.connect).not.toHaveBeenCalled();
  });
});
