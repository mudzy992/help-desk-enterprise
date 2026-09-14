import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { NotificationRealtimePublish } from '../notifications/notification-realtime.types';
import { toNotificationRealtimeClientPayload } from '../notifications/to-notification-realtime-client-payload';
import type { SettingsUpdatedRealtimePayload } from '../settings/settings-realtime.types';
import { userRoomName } from './ticket-socket-rooms';

export function broadcastNotificationRealtime(
  server: Server,
  event: NotificationRealtimePublish,
): void {
  server
    .to(userRoomName(event.userId))
    .emit(event.eventName, toNotificationRealtimeClientPayload(event));
}

export function broadcastSettingsUpdated(
  server: Server,
  payload: SettingsUpdatedRealtimePayload,
): void {
  server.emit(ticketRealtimeEventNames.settingsUpdated, payload);
  if (payload.invalidatesSession) {
    server.emit(ticketRealtimeEventNames.sessionInvalidated, {
      occurredAt: payload.occurredAt,
    });
  }
}
