import type { NotificationRealtimePayload } from "./apply-notification-realtime";
import { isStaleTicketEvent } from "./upsert-ticket-message";

export function shouldInvalidateTicketCollectionFromUpdated(payload: {
  readonly ticketId: string;
}): boolean {
  if (payload.ticketId.length === 0) {
    return false;
  }
  return !isStaleTicketEvent(payload.ticketId, payload.ticketId);
}

export function shouldInvalidateTicketCollectionFromNotification(
  payload: NotificationRealtimePayload,
): boolean {
  const ticketId = payload.notification?.ticketId;
  if (typeof ticketId === "string" && ticketId.length > 0) {
    return !isStaleTicketEvent(ticketId, ticketId);
  }
  return payload.notification !== null;
}
