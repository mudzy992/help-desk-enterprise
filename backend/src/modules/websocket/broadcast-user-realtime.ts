import {
  adminRealtimeEventNames,
  adminRealtimeRoomName,
  type AdminConfigUpdatedPayload,
} from '../../common/admin-realtime/admin-config-realtime.types';
import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type {
  GroupNotificationRealtimeClientPayload,
  GroupNotificationRealtimePublish,
  NotificationRealtimePublish,
} from '../notifications/notification-realtime.types';
import { toNotificationRealtimeClientPayload } from '../notifications/to-notification-realtime-client-payload';
import {
  settingsRealtimeEventNames,
  type SettingsUpdatedRealtimePayload,
} from '../settings/settings-realtime.types';
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

/**
 * Package 1.7 (R2): admin room only. Routing changes also go out under the
 * RAW §749 name `routing.rules.updated`.
 */
export function broadcastAdminConfigUpdated(
  server: Server,
  payload: AdminConfigUpdatedPayload,
): void {
  const room = server.to(adminRealtimeRoomName);
  room.emit(adminRealtimeEventNames.configUpdated, payload);
  if (payload.domain === 'routing') {
    room.emit(adminRealtimeEventNames.routingRulesUpdated, payload);
  }
  recordWebsocketEmit('group');
}

export function broadcastSettingsUpdated(
  server: Server,
  payload: SettingsUpdatedRealtimePayload,
): void {
  // Every authenticated client needs an invalidation signal, not the setting
  // key. Private/secret registry metadata is routed only to the trusted admin
  // room, whose membership is maintained by socket room revalidation.
  server.emit(ticketRealtimeEventNames.settingsUpdated, {
    occurredAt: payload.occurredAt,
  });
  if (payload.visibility !== 'public') {
    server.to(adminRealtimeRoomName).emit(
      settingsRealtimeEventNames.privateMetadataUpdated,
      payload,
    );
  }
  if (payload.invalidatesSession) {
    server.emit(ticketRealtimeEventNames.sessionInvalidated, {
      occurredAt: payload.occurredAt,
    });
  }
}
