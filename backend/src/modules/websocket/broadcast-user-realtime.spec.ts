import type { Server } from 'socket.io';
import { adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { settingsRealtimeEventNames } from '../settings/settings-realtime.types';
import {
  broadcastNotificationRealtime,
  broadcastSettingsUpdated,
} from './broadcast-user-realtime';
import { userRoomName } from './ticket-socket-rooms';

jest.mock('../tickets/collaboration.constants', () => ({
  ticketRealtimeEventNames: {
    notificationCreated: 'notification.created',
    notificationUnreadCount: 'notification.unread-count',
    settingsUpdated: 'settings.updated',
    sessionInvalidated: 'session.invalidated',
  },
}));

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
          eventId: 'notif-1',
          createdAt: '2026-09-13T08:00:00.000Z',
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

  it('sends keyless settings signals globally and private metadata only to admins', () => {
    const { server, emitted } = createServer();
    const payload = {
      key: 'private.auth.jwtSigningSecret',
      visibility: 'secret' as const,
      occurredAt: '2026-09-13T08:00:00.000Z',
      invalidatesSession: true,
    };
    broadcastSettingsUpdated(server, payload);

    expect(emitted).toEqual([
      {
        room: null,
        event: ticketRealtimeEventNames.settingsUpdated,
        payload: { occurredAt: payload.occurredAt },
      },
      {
        room: adminRealtimeRoomName,
        event: settingsRealtimeEventNames.privateMetadataUpdated,
        payload,
      },
      {
        room: null,
        event: ticketRealtimeEventNames.sessionInvalidated,
        payload: { occurredAt: payload.occurredAt },
      },
    ]);
    expect(JSON.stringify(emitted[0])).not.toContain(payload.key);
    expect(JSON.stringify(emitted[2])).not.toContain(payload.key);
  });

  it('routes ordinary private setting metadata only to the admin room', () => {
    const { server, emitted } = createServer();
    const payload = {
      key: 'private.inbound.createTickets',
      visibility: 'private' as const,
      occurredAt: '2026-09-13T08:00:00.000Z',
      invalidatesSession: false,
    };
    broadcastSettingsUpdated(server, payload);

    expect(emitted).toEqual([
      {
        room: null,
        event: ticketRealtimeEventNames.settingsUpdated,
        payload: { occurredAt: payload.occurredAt },
      },
      {
        room: adminRealtimeRoomName,
        event: settingsRealtimeEventNames.privateMetadataUpdated,
        payload,
      },
    ]);
  });

  it('does not send private metadata for public setting changes', () => {
    const { server, emitted } = createServer();
    broadcastSettingsUpdated(server, {
      key: 'public.maintenance.enabled',
      visibility: 'public',
      occurredAt: '2026-09-13T08:00:00.000Z',
      invalidatesSession: false,
    });

    expect(emitted).toEqual([
      {
        room: null,
        event: ticketRealtimeEventNames.settingsUpdated,
        payload: { occurredAt: '2026-09-13T08:00:00.000Z' },
      },
    ]);
  });
});
