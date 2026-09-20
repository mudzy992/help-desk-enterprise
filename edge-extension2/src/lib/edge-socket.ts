import type { Socket } from 'socket.io-client';

import type { EdgeExtensionBootstrap } from './bootstrap-client';
import { handleNotificationCreated } from './handle-notification-created';
import {
  fetchUnreadNotifications,
  scheduleUnreadPolling,
  stopUnreadPolling,
} from './polling-fallback';
import { connectUserSocket } from './socket-session';

export type EdgeSocketHandle = {
  socket: Socket | null;
  connected: boolean;
};

export function createEdgeSocketHandle(): EdgeSocketHandle {
  return {
    socket: null,
    connected: false,
  };
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
    void stopUnreadPolling();
  });

  handle.socket.on('disconnect', () => {
    handle.connected = false;

    if (settings.pollingFallbackEnabled) {
      void scheduleUnreadPolling(settings.pollingIntervalSeconds);
    }
  });

  handle.socket.on('connect_error', () => {
    handle.connected = false;

    if (settings.pollingFallbackEnabled) {
      void scheduleUnreadPolling(settings.pollingIntervalSeconds);
    }
  });

  handle.socket.on(
    'notification.created',
    (payload: unknown) => {
      void handleNotificationCreated({
        payload: payload as never,
        bootstrap: settings,
        apiBaseUrl,
        accessToken,
      });
    },
  );
}

/**
 * Compatibility wrapper for the existing Edge session lifecycle.
 *
 * MV3-safe polling is implemented with chrome.alarms rather than
 * setInterval so the service worker can safely suspend/resume.
 */
export async function beginPolling(
  handle: EdgeSocketHandle,
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): Promise<void> {
  handle.connected = false;

  await scheduleUnreadPolling(settings.pollingIntervalSeconds);

  // Run one poll immediately instead of waiting for the first alarm.
  await runPollingOnce(
    apiBaseUrl,
    accessToken,
    settings,
  );
}

export async function runPollingOnce(
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): Promise<void> {
  const notifications = await fetchUnreadNotifications({
    apiBaseUrl,
    accessToken,
  });

  for (const item of notifications) {
    await handleNotificationCreated({
      payload: {
        eventId: item.id,
        notification: item,
      },
      bootstrap: settings,
      apiBaseUrl,
      accessToken,
    });
  }
}

export function joinTicketRoom(
  handle: EdgeSocketHandle,
  ticketId: string,
): void {
  handle.socket?.emit('ticket:join', {
    ticketId,
  });
}

export function tearDownEdgeSocket(
  handle: EdgeSocketHandle,
): void {
  handle.connected = false;

  handle.socket?.removeAllListeners();
  handle.socket?.disconnect();

  handle.socket = null;

  void stopUnreadPolling();
}
