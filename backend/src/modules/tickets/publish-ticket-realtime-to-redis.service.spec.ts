import { PublishTicketRealtimeToRedisService } from './publish-ticket-realtime-to-redis.service';

const payload = {
  kind: 'message',
  payload: {
    id: 'message-00000001',
    ticketId: 'ticket-00000001',
    type: 'SYSTEM_EVENT',
    body: 'ticket_playbook_attached:1:Checklist',
    authorUserId: null,
    createdAt: '2026-11-05T12:00:00.000Z',
    requesterId: 'requester-00000001',
    assignedGroupId: null,
    visibility: 'staff',
  },
} as const;

describe('PublishTicketRealtimeToRedisService', () => {
  it('publishes to the API bridge and accepts an active subscriber', async () => {
    const redis = {
      status: 'ready',
      connect: jest.fn(),
      publish: jest.fn().mockResolvedValue(1),
    };
    const service = new PublishTicketRealtimeToRedisService(redis as never);

    await expect(service.publish(payload)).resolves.toBeUndefined();
    expect(redis.publish).toHaveBeenCalledWith(
      'tickets:realtime-bridge',
      JSON.stringify(payload),
    );
  });

  it('fails delivery when Redis has no API subscriber so the outbox can retry', async () => {
    const redis = {
      status: 'ready',
      connect: jest.fn(),
      publish: jest.fn().mockResolvedValue(0),
    };
    const service = new PublishTicketRealtimeToRedisService(redis as never);

    await expect(service.publish(payload)).rejects.toThrow('TICKET_REALTIME_NO_API_SUBSCRIBER');
  });

  it('connects a waiting Redis client before publishing', async () => {
    const redis = {
      status: 'wait',
      connect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
    };
    const service = new PublishTicketRealtimeToRedisService(redis as never);

    await service.publish(payload);
    expect(redis.connect).toHaveBeenCalledTimes(1);
  });
});
