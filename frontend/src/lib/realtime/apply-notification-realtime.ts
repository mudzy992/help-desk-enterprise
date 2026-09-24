import type { InAppNotification } from "@/services/notifications-api";

export type NotificationRealtimePayload = {
  readonly notification: InAppNotification | null;
  /** Absent on a group-room event (option A): the room is shared, there is no per-user badge. */
  readonly unreadCount?: number;
  readonly readAll: boolean;
  readonly occurredAt: string;
  /** Option A group notification: add this to the local badge instead. */
  readonly unreadDelta?: number;
  /** Option A: members who must ignore this group event (actor, personal recipients). */
  readonly excludedUserIds?: readonly string[];
};

/** A group-room event the current user is excluded from (they get a personal one, or acted). */
export function isExcludedGroupEvent(
  payload: NotificationRealtimePayload,
  currentUserId: string | null,
): boolean {
  return (
    currentUserId !== null &&
    (payload.excludedUserIds ?? []).includes(currentUserId)
  );
}

/** Next badge value: the server's count when sent, otherwise the local count + delta. */
export function nextUnreadCount(
  current: number,
  payload: NotificationRealtimePayload,
): number {
  if (typeof payload.unreadCount === "number") {
    return payload.unreadCount;
  }
  return current + (payload.unreadDelta ?? 0);
}

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
