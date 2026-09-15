import { TicketRealtimeHub } from './ticket-realtime.hub';
import { ticketRealtimeEventNames } from './collaboration.constants';

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
});
