import type { Socket } from 'socket.io-client';
import type { EdgeExtensionBootstrap } from './bootstrap-client';
import { connectUserSocket } from './socket-session';

export type EdgeSocketHandle = {
  socket: Socket | null;
  connected: boolean;
};

export type EdgeSocketCallbacks = {
  /** WS `notification.created` (isti envelope kao web, + `eventId`). */
  readonly onNotificationCreated: (payload: unknown) => void;
  /** `notification.unread-count` / `notification.read` / readAll. */
  readonly onUnreadCount: (unreadCount: number) => void;
  /** Public-room `ticket.message.created` (za otvoreni thread u popupu). */
  readonly onTicketMessage: (payload: unknown) => void;
  /** `ticket.updated` (gledani tiket). */
  readonly onTicketUpdated: (payload: unknown) => void;
  /** Promjena transporta; `false` = kandidat za polling fallback. */
  readonly onConnectionChange: (connected: boolean) => void;
  /** Auth/handshake greška — edge-session reagira (poll / re-auth). */
  readonly onConnectError: (message: string) => void;
  /** Popup gleda thread → nakon (re)connecta treba ponoviti `ticket:join`. */
  readonly getWatchedTicketId: () => string | null;
};

export function createEdgeSocketHandle(): EdgeSocketHandle {
  return { socket: null, connected: false };
}

export function attachEdgeSocket(
  handle: EdgeSocketHandle,
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
  callbacks: EdgeSocketCallbacks,
): void {
  tearDownEdgeSocket(handle);
  const socket = connectUserSocket({
    apiBaseUrl,
    accessToken,
    reconnectMaxBackoffSeconds: settings.reconnectMaxBackoffSeconds,
  });
  handle.socket = socket;

  socket.on('connect', () => {
    handle.connected = true;
    callbacks.onConnectionChange(true);
    const watched = callbacks.getWatchedTicketId();
    if (watched !== null) {
      socket.emit('ticket:join', { ticketId: watched });
    }
  });

  socket.on('disconnect', () => {
    handle.connected = false;
    callbacks.onConnectionChange(false);
  });

  socket.on('connect_error', (error: Error) => {
    handle.connected = false;
    callbacks.onConnectError(error.message);
  });

  socket.on('notification.created', (payload: unknown) => {
    callbacks.onNotificationCreated(payload);
  });

  socket.on('notification.unread-count', (payload: unknown) => {
    const unreadCount = readUnreadCount(payload);
    if (unreadCount !== null) {
      callbacks.onUnreadCount(unreadCount);
    }
  });

  socket.on('notification.read', (payload: unknown) => {
    const unreadCount = readUnreadCount(payload);
    if (unreadCount !== null) {
      callbacks.onUnreadCount(unreadCount);
    }
  });

  socket.on('ticket.message.created', (payload: unknown) => {
    callbacks.onTicketMessage(payload);
  });

  socket.on('ticket.updated', (payload: unknown) => {
    callbacks.onTicketUpdated(payload);
  });
}

export function joinTicketRoom(handle: EdgeSocketHandle, ticketId: string): void {
  handle.socket?.emit('ticket:join', { ticketId });
}

export function leaveTicketRoom(handle: EdgeSocketHandle, ticketId: string): void {
  handle.socket?.emit('ticket:leave', { ticketId });
}

export function tearDownEdgeSocket(handle: EdgeSocketHandle): void {
  handle.connected = false;
  handle.socket?.removeAllListeners();
  handle.socket?.disconnect();
  handle.socket = null;
}

function readUnreadCount(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const value = (payload as { readonly unreadCount?: unknown }).unreadCount;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}
