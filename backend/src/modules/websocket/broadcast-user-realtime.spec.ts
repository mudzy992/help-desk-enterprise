import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import {
  broadcastNotificationRealtime,
  broadcastSettingsUpdated,
} from './broadcast-user-realtime';
import { userRoomName } from './ticket-socket-rooms';

function createServer() {
  const emitted: { room: string | null; event: string; payload: unknown }[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
    emit: (event: string, payload: unknown) => {
      emitted.push({ room: null, event, payload });
    },
  } as unknown as Server;
  return { server, emitted };
}

describe('broadcastUserRealtime', () => {
  it('broadcasts notifications only to the recipient user room', () => {
    const { server, emitted } = createServer();
    broadcastNotificationRealtime(server, {
      userId: 'user-agent-it',
      eventName: ticketRealtimeEventNames.notificationCreated,
      notification: {
        id: 'notif-1',
        type: 'ticket.assigned',
        title: 'Assigned',
        body: 'T-1',
        isRead: false,
        readAt: null,
        ticketId: 'ticket-1',
        payload: null,
        createdAt: '2026-09-13T08:00:00.000Z',
      },
      unreadCount: 2,
    });
    expect(emitted).toEqual([
      {
        room: userRoomName('user-agent-it'),
        event: ticketRealtimeEventNames.notificationCreated,
        payload: {
          notification: expect.objectContaining({ id: 'notif-1' }),
          unreadCount: 2,
          readAll: false,
          occurredAt: '2026-09-13T08:00:00.000Z',
        },
      },
    ]);
  });

  it('broadcasts unread count updates to the same user room', () => {
    const { server, emitted } = createServer();
    broadcastNotificationRealtime(server, {
      userId: 'user-agent-it',
      eventName: ticketRealtimeEventNames.notificationUnreadCount,
      notification: null,
      unreadCount: 0,
    });
    expect(emitted[0]).toMatchObject({
      room: userRoomName('user-agent-it'),
      event: ticketRealtimeEventNames.notificationUnreadCount,
      payload: { unreadCount: 0, readAll: false },
    });
  });

  it('emits settings updates without secrets and invalidates sessions', () => {
    const { server, emitted } = createServer();
    broadcastSettingsUpdated(server, {
      key: 'private.auth.jwtSigningSecret',
      visibility: 'secret',
      occurredAt: '2026-09-13T08:00:00.000Z',
      invalidatesSession: true,
    });
    expect(emitted.map((item) => item.event)).toEqual([
      ticketRealtimeEventNames.settingsUpdated,
      ticketRealtimeEventNames.sessionInvalidated,
    ]);
    expect(JSON.stringify(emitted)).not.toContain('password');
    expect(JSON.stringify(emitted)).not.toMatch(/"token"/);
  });
});
