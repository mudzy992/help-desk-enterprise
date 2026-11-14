import {
  applyNotificationCreated,
  applyNotificationRead,
  type NotificationRealtimePayload,
} from "@/lib/realtime/apply-notification-realtime";
import type { InAppNotification } from "@/services/notifications-api";

export const notificationEventJournalLimit = 500;
export function recordNotificationEvent(
  events: Array<{ kind: "created" | "read"; payload: NotificationRealtimePayload }>,
  kind: "created" | "read",
  payload: NotificationRealtimePayload,
): void {
  // Keep one extra entry as a bounded overflow marker; never apply an incomplete journal.
  if (events.length <= notificationEventJournalLimit) events.push({ kind, payload });
}

export function checkNotificationJournal(
  events: readonly unknown[],
  onOverflow: () => void,
): boolean {
  if (events.length <= notificationEventJournalLimit) return true;
  onOverflow();
  return false;
}

export function markKnownRead(
  items: readonly InAppNotification[],
  ids: ReadonlySet<string>,
  unreadOnly: boolean,
): InAppNotification[] {
  return unreadOnly
    ? items.filter((item) => !ids.has(item.id))
    : items.map((item) => (ids.has(item.id) ? { ...item, isRead: true } : item));
}

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function appendUniqueNotifications(
  current: readonly InAppNotification[],
  incoming: readonly InAppNotification[],
): InAppNotification[] {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}

export function reconcileListEvents(
  items: readonly InAppNotification[],
  events: readonly { kind: "created" | "read"; payload: NotificationRealtimePayload }[],
  unreadOnly: boolean,
): InAppNotification[] {
  let result = [...items];
  for (const event of events) {
    result =
      event.kind === "created"
        ? applyNotificationCreated(result, event.payload)
        : applyNotificationRead(result, event.payload);
  }
  return unreadOnly ? result.filter((item) => !item.isRead) : result;
}
