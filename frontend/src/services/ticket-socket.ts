import { io, type Socket } from "socket.io-client";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export const ticketSocketEvents = {
  join: "ticket:join",
  leave: "ticket:leave",
  messageCreated: "ticket.message.created",
  ticketUpdated: "ticket.updated",
  // Faza 3.2: laki event za group sobe (< 200 B, bez sadržaja tiketa).
  groupFeedChanged: "group.feed-changed",
  notificationCreated: "notification.created",
  notificationRead: "notification.read",
  notificationUnreadCount: "notification.unread-count",
  settingsUpdated: "settings.updated",
  sessionInvalidated: "session.invalidated",
} as const;

export function connectTicketSocket(token: string): Socket {
  return io(apiBaseUrl, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
  });
}

export function joinTicketRoom(socket: Socket, ticketId: string): void {
  socket.emit(ticketSocketEvents.join, { ticketId });
}

export function leaveTicketRoom(socket: Socket, ticketId: string): void {
  socket.emit(ticketSocketEvents.leave, { ticketId });
}
