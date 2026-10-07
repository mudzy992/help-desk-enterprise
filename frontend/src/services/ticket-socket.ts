import type { Socket } from "socket.io-client";

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
  // Paket 2.4: presence ("viewing / typing").
  presence: "ticket:presence",
  presenceUpdate: "ticket:presence:update",
} as const;

// M11 B5: the only production path to a Socket.IO connection is
// `acquireHelpdeskSocket` in helpdesk-socket.ts (shared reference count across
// all hooks). The old standalone `connectTicketSocket` was removed so there is
// no alternative socket pattern to drift from. Do NOT add a new standalone
// connect helper here — route everything through acquireHelpdeskSocket.

export function joinTicketRoom(socket: Socket, ticketId: string): void {
  socket.emit(ticketSocketEvents.join, { ticketId });
}

export function leaveTicketRoom(socket: Socket, ticketId: string): void {
  socket.emit(ticketSocketEvents.leave, { ticketId });
}
