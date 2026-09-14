import type { Socket } from 'socket.io-client';
import type { EdgeExtensionBootstrap } from './bootstrap-client';
import { handleNotificationCreated } from './handle-notification-created';
import {
  fetchUnreadNotifications,
  startUnreadPolling,
} from './polling-fallback';
import { connectUserSocket } from './socket-session';

export type EdgeSocketHandle = {
  socket: Socket | null;
  stopPolling: (() => void) | null;
  connected: boolean;
};

export function createEdgeSocketHandle(): EdgeSocketHandle {
  return { socket: null, stopPolling: null, connected: false };
}

export function attachEdgeSocket(
  handle: EdgeSocketHandle,
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): void {
  handle.socket = connectUserSocket({
    apiBaseUrl,
    accessToken,
    reconnectMaxBackoffSeconds: settings.reconnectMaxBackoffSeconds,
  });
  handle.socket.on('connect', () => {
    handle.connected = true;
    handle.stopPolling?.();
    handle.stopPolling = null;
  });
  handle.socket.on('disconnect', () => {
    handle.connected = false;
    if (settings.pollingFallbackEnabled) {
      beginPolling(handle, apiBaseUrl, accessToken, settings);
    }
  });
  handle.socket.on('notification.created', (payload: unknown) => {
    void handleNotificationCreated({
      payload: payload as never,
      bootstrap: settings,
      apiBaseUrl,
      accessToken,
    });
  });
}

export function joinTicketRoom(
  handle: EdgeSocketHandle,
  ticketId: string,
): void {
  handle.socket?.emit('ticket:join', { ticketId });
}

export function beginPolling(
  handle: EdgeSocketHandle,
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): void {
  if (handle.stopPolling !== null) {
    return;
  }
  handle.stopPolling = startUnreadPolling({
    intervalSeconds: settings.pollingIntervalSeconds,
    tick: () => {
      void pollUnread(apiBaseUrl, accessToken, settings);
    },
  });
}

export function tearDownEdgeSocket(handle: EdgeSocketHandle): void {
  handle.stopPolling?.();
  handle.stopPolling = null;
  handle.connected = false;
  handle.socket?.removeAllListeners();
  handle.socket?.disconnect();
  handle.socket = null;
}

async function pollUnread(
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): Promise<void> {
  const items = await fetchUnreadNotifications({ apiBaseUrl, accessToken });
  for (const item of items) {
    await handleNotificationCreated({
      payload: { eventId: item.id, notification: item },
      bootstrap: settings,
      apiBaseUrl,
      accessToken,
    });
  }
}
