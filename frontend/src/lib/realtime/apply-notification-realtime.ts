import type { InAppNotification } from "@/services/notifications-api";

export type NotificationRealtimePayload = {
  readonly notification: InAppNotification | null;
  readonly unreadCount: number;
  readonly readAll: boolean;
  readonly occurredAt: string;
};

export function applyNotificationCreated(
  items: readonly InAppNotification[],
  payload: NotificationRealtimePayload,
): InAppNotification[] {
  const incoming = payload.notification;
  if (incoming === null || items.some((item) => item.id === incoming.id)) {
    return [...items];
  }
  return [incoming, ...items];
}

export function applyNotificationRead(
  items: readonly InAppNotification[],
  payload: NotificationRealtimePayload,
): InAppNotification[] {
  if (payload.readAll) {
    return items.map((item) => ({
      ...item,
      isRead: true,
      readAt: item.readAt ?? payload.occurredAt,
    }));
  }
  const incoming = payload.notification;
  if (incoming === null) {
    return [...items];
  }
  return items.map((item) => (item.id === incoming.id ? incoming : item));
}
