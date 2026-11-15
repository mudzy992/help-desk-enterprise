import type { Server } from "socket.io";
import type { EdgeEventRealtimePublish } from "../tickets/ticket-realtime.types";
import { ticketRoomName, userRoomName } from "./ticket-socket-rooms";

export function broadcastEdgeEventRealtime(
  server: Server,
  event: EdgeEventRealtimePublish,
): void {
  server.to(userRoomName(event.userId)).emit(event.eventName, event.data);
  // Notification payloads contain recipient-specific rows and unread counts.
  // Ticket-room members are not necessarily recipients of this user event.
  if (
    event.ticketId !== undefined &&
    !event.eventName.startsWith("notification.")
  ) {
    server.to(ticketRoomName(event.ticketId)).emit(event.eventName, event.data);
  }
}
