import { Logger } from '@nestjs/common';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketRealtimeRedisForwarder } from './ticket-realtime.redis-forwarder';

describe('TicketRealtimeRedisForwarder', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  const payload = {
    id: 'message-00000001',
    ticketId: 'ticket-00000001',
    type: 'SYSTEM_EVENT',
    body: 'ticket_playbook_step_checked:1:Verify',
    authorUserId: 'actor-00000001',
    createdAt: '2026-11-05T12:00:00.000Z',
    requesterId: 'requester-00000001',
    assignedGroupId: null,
    visibility: 'staff',
  } as const;

  it('forwards through the bridge when the outbox awaits the hub listener', async () => {
    const hub = new TicketRealtimeHub();
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const forwarder = new TicketRealtimeRedisForwarder(hub, publisher as never);
    forwarder.onModuleInit();

    try {
      await hub.publishAwaited(payload);
      expect(publisher.publish).toHaveBeenCalledWith({ kind: 'message', payload });
    } finally {
      forwarder.onModuleDestroy();
    }
  });

  it('rejects awaited delivery on bridge failure so the transactional outbox retries', async () => {
    const hub = new TicketRealtimeHub();
    const failure = new Error('Redis bridge unavailable');
    const publisher = { publish: jest.fn().mockRejectedValue(failure) };
    const forwarder = new TicketRealtimeRedisForwarder(hub, publisher as never);
    forwarder.onModuleInit();

    try {
      await expect(hub.publishAwaited(payload)).rejects.toBe(failure);
      expect(publisher.publish).toHaveBeenCalledWith({ kind: 'message', payload });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ticket_realtime_bridge_publish_failed'));
    } finally {
      forwarder.onModuleDestroy();
    }
  });
});
