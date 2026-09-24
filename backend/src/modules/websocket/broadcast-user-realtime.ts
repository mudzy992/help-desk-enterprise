import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type {
  GroupNotificationRealtimeClientPayload,
  GroupNotificationRealtimePublish,
  NotificationRealtimePublish,
} from '../notifications/notification-realtime.types';
import { toNotificationRealtimeClientPayload } from '../notifications/to-notification-realtime-client-payload';
import type { SettingsUpdatedRealtimePayload } from '../settings/settings-realtime.types';
import { groupRoomName, userRoomName } from './ticket-socket-rooms';
import { recordWebsocketEmit } from './websocket-emit-counter';

export function broadcastNotificationRealtime(
  server: Server,
  event: NotificationRealtimePublish,
): void {
  server
    .to(userRoomName(event.userId))
    .emit(event.eventName, toNotificationRealtimeClientPayload(event));
  recordWebsocketEmit('user');
}

/** Option A: one emit for the whole group instead of one per member. */
export function broadcastGroupNotificationRealtime(
  server: Server,
  event: GroupNotificationRealtimePublish,
): void {
  const payload: GroupNotificationRealtimeClientPayload = {
    eventId: event.notification.id,
    createdAt: event.notification.createdAt,
    notification: event.notification,
    unreadDelta: 1,
    excludedUserIds: event.excludedUserIds,
    groupId: event.groupId,
    readAll: false,
    occurredAt: event.notification.createdAt,
  };
  server
    .to(groupRoomName(event.groupId))
    .emit(ticketRealtimeEventNames.notificationCreated, payload);
  recordWebsocketEmit('group');
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
