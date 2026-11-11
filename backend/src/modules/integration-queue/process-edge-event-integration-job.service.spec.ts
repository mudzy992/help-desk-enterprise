import { IntegrationJobStatus } from '../../generated/prisma/enums';
import {
  EdgeEventNoSubscribersError,
  edgeEventNoSubscribersCode,
  ProcessEdgeEventIntegrationJobService,
} from './process-edge-event-integration-job.service';

const validPayload = {
  userId: 'user-1',
  ticketId: ' ticket-1 ',
  eventName: 'ticket.updated',
  data: { status: 'ASSIGNED' },
};

describe('ProcessEdgeEventIntegrationJobService', () => {
  it('returns only an explicitly best-effort outcome after Redis reports subscribers', async () => {
    const publisher = { publish: jest.fn().mockResolvedValue(1) };
    const service = new ProcessEdgeEventIntegrationJobService(publisher as never);

    await expect(service.process(validPayload)).resolves.toBe(
      IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
    );
    expect(publisher.publish).toHaveBeenCalledWith({
      userId: 'user-1',
      ticketId: 'ticket-1',
      eventName: 'ticket.updated',
      data: { status: 'ASSIGNED' },
    });
  });

  it('fails retryably with a stable observable code when there are no subscribers', async () => {
    const publisher = { publish: jest.fn().mockResolvedValue(0) };
    const service = new ProcessEdgeEventIntegrationJobService(publisher as never);

    let rejection: unknown;
    try {
      await service.process(validPayload);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(EdgeEventNoSubscribersError);
    expect(rejection).toMatchObject({
      name: 'EdgeEventNoSubscribersError',
      message: edgeEventNoSubscribersCode,
      code: edgeEventNoSubscribersCode,
    });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('propagates Redis errors so the processor uses its existing retry path', async () => {
    const redisError = new Error('Redis unavailable');
    const publisher = { publish: jest.fn().mockRejectedValue(redisError) };
    const service = new ProcessEdgeEventIntegrationJobService(publisher as never);

    await expect(service.process(validPayload)).rejects.toBe(redisError);
  });

  it('rejects malformed payloads without publishing', async () => {
    const publisher = { publish: jest.fn() };
    const service = new ProcessEdgeEventIntegrationJobService(publisher as never);

    await expect(service.process({ eventName: 'ticket.updated' })).rejects.toThrow(
      'Invalid EDGE_EVENT integration job payload',
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
