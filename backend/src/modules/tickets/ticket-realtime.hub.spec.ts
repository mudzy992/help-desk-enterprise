import { TicketRealtimeHub } from './ticket-realtime.hub';
import { ticketRealtimeEventNames } from './collaboration.constants';
import type { TicketUpdatedRealtimePayload } from './ticket-realtime.types';

describe('TicketRealtimeHub', () => {
  it('isolates message, ticket.updated, and notification listeners', () => {
    const hub = new TicketRealtimeHub();
    const messages: string[] = [];
    const updates: string[] = [];
    const notifications: string[] = [];
    const offMessage = hub.subscribe((payload) => messages.push(payload.id));
    hub.subscribeTicketUpdated((payload) => updates.push(payload.ticketId));
    hub.subscribeNotification((payload) => notifications.push(payload.userId));
    hub.publish({
      id: 'msg-1',
      ticketId: 'ticket-1',
      type: 'AGENT_REPLY',
      body: 'ok',
      authorUserId: 'a',
      createdAt: '2026-09-13T08:00:00.000Z',
      requesterId: 'r',
      assignedGroupId: null,
      visibility: 'public',
    });
    hub.publishTicketUpdated({
      ticketId: 'ticket-1',
      change: 'status',
      sourceAction: 'ticket_resolved',
      sourceMessageId: 'msg-1',
      status: 'RESOLVED',
      priority: 'LOW',
      assignedUserId: null,
      assignedGroupId: null,
      requesterId: 'r',
      archivedAt: null,
      resolvedAt: null,
      closedAt: null,
      actorUserId: null,
      occurredAt: '2026-09-13T08:00:00.000Z',
      visibility: 'public',
    });
    hub.publishNotification({
      userId: 'user-1',
      eventName: ticketRealtimeEventNames.notificationCreated,
      notification: null,
      unreadCount: 1,
    });
    expect(messages).toEqual(['msg-1']);
    expect(updates).toEqual(['ticket-1']);
    expect(notifications).toEqual(['user-1']);
    const edgeEvents: string[] = [];
    hub.subscribeEdgeEvent((payload) => edgeEvents.push(payload.eventName));
    hub.publishEdgeEvent({
      userId: 'user-1',
      ticketId: 'ticket-1',
      eventName: 'notification.created',
      data: { ok: true },
    });
    expect(edgeEvents).toEqual(['notification.created']);
    offMessage();
    hub.publish({
      id: 'msg-2',
      ticketId: 'ticket-1',
      type: 'AGENT_REPLY',
      body: 'again',
      authorUserId: 'a',
      createdAt: '2026-09-13T08:00:01.000Z',
      requesterId: 'r',
      assignedGroupId: null,
      visibility: 'public',
    });
    expect(messages).toEqual(['msg-1']);
  });

  it('deduplicates a successful outbox update when its paired message is retried', async () => {
    const hub = new TicketRealtimeHub();
    const published: string[] = [];
    hub.subscribeTicketUpdatedAwaited((payload) => {
      if (payload.sourceMessageId !== null) published.push(payload.sourceMessageId);
    });
    const payload = ticketUpdatedPayload('msg-outbox');

    await hub.publishTicketUpdatedAwaitedOnce(payload);
    await hub.publishTicketUpdatedAwaitedOnce(payload);

    expect(published).toEqual(['msg-outbox']);
  });

  it('coalesces concurrent duplicate outbox update publications', async () => {
    const hub = new TicketRealtimeHub();
    let publishCount = 0;
    let markStarted!: () => void;
    let releasePublication!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    hub.subscribeTicketUpdatedAwaited(async () => {
      publishCount += 1;
      markStarted();
      await blocked;
    });
    const payload = ticketUpdatedPayload('msg-concurrent');

    const first = hub.publishTicketUpdatedAwaitedOnce(payload);
    await started;
    const second = hub.publishTicketUpdatedAwaitedOnce(payload);
    releasePublication();
    await Promise.all([first, second]);

    expect(publishCount).toBe(1);
  });

  it('allows an outbox retry when awaited ticket-update publication failed', async () => {
    const hub = new TicketRealtimeHub();
    const attempts: string[] = [];
    let failFirstAttempt = true;
    hub.subscribeTicketUpdatedAwaited((payload) => {
      if (payload.sourceMessageId === null) return;
      attempts.push(payload.sourceMessageId);
      if (failFirstAttempt) {
        failFirstAttempt = false;
        throw new Error('temporary bridge failure');
      }
    });
    const payload = ticketUpdatedPayload('msg-retry');

    await expect(hub.publishTicketUpdatedAwaitedOnce(payload)).rejects.toThrow(
      'temporary bridge failure',
    );
    await hub.publishTicketUpdatedAwaitedOnce(payload);

    expect(attempts).toEqual(['msg-retry', 'msg-retry']);
  });
});

function ticketUpdatedPayload(
  sourceMessageId: string,
): TicketUpdatedRealtimePayload {
  return {
    ticketId: 'ticket-outbox',
    change: 'status',
    sourceAction: 'ticket_resolved',
    sourceMessageId,
    status: 'RESOLVED',
    priority: 'LOW',
    assignedUserId: null,
    assignedGroupId: null,
    requesterId: 'requester-1',
    archivedAt: null,
    resolvedAt: '2026-09-13T08:00:00.000Z',
    closedAt: null,
    actorUserId: 'agent-1',
    occurredAt: '2026-09-13T08:00:00.000Z',
    visibility: 'public',
  };
}
