import type { NotificationRealtimePublish } from './notification-realtime.types';
import type { NotificationRealtimeClientPayload } from './notification-realtime.types';

export function toNotificationRealtimeClientPayload(
  event: NotificationRealtimePublish,
): NotificationRealtimeClientPayload {
  const occurredAt =
    event.notification?.createdAt ??
    event.notification?.readAt ??
    new Date().toISOString();
  return {
    eventId: resolveNotificationEventId(event, occurredAt),
    createdAt: occurredAt,
    notification: event.notification,
    unreadCount: event.unreadCount,
    readAll: event.readAll === true,
    occurredAt,
  };
}

function resolveNotificationEventId(
  event: NotificationRealtimePublish,
  occurredAt: string,
): string {
  if (event.notification !== null) {
    return event.notification.id;
  }
  if (event.readAll === true) {
    return `${event.eventName}:read-all:${event.userId}:${occurredAt}`;
  }
  return `${event.eventName}:${event.userId}:${event.unreadCount}:${occurredAt}`;
}
