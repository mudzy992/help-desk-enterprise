import type { Socket } from "socket.io-client";

export const ticketSocketEvents = {
  join: "ticket:join",
  leave: "ticket:leave",
  messageCreated: "ticket.message.created",
  ticketUpdated: "ticket.updated",
  // Lightweight group-room event (< 200 B, without ticket content).
  groupFeedChanged: "group.feed-changed",
  notificationCreated: "notification.created",
  notificationRead: "notification.read",
  notificationUnreadCount: "notification.unread-count",
  settingsUpdated: "settings.updated",
  sessionInvalidated: "session.invalidated",
  // Presence events represent viewing and typing state.
  presence: "ticket:presence",
  presenceUpdate: "ticket:presence:update",
} as const;

// The only production path to a Socket.IO connection is
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
