import type { Socket } from 'socket.io-client';
import { fetchEdgeBootstrap, type EdgeExtensionBootstrap } from './lib/bootstrap-client';
import {
  extensionMessageTypes,
  type ExtensionRuntimeMessage,
  type ExtensionStatus,
} from './lib/extension-messages';
import { resetEventDedup, ticketIdForEvent } from './lib/event-dedup';
import { handleNotificationCreated } from './lib/handle-notification-created';
import {
  clearAccessToken,
  readAccessToken,
  readApiBaseUrl,
  writeAccessToken,
  writeApiBaseUrl,
} from './lib/memory-token';
import { openDeskUrl } from './lib/open-in-desk';
import {
  fetchUnreadNotifications,
  startUnreadPolling,
} from './lib/polling-fallback';
import { sendNotificationReceipt } from './lib/receipts-client';
import { connectUserSocket } from './lib/socket-session';

let socket: Socket | null = null;
let stopPolling: (() => void) | null = null;
let bootstrap: EdgeExtensionBootstrap | null = null;
let connected = false;

chrome.runtime.onInstalled.addListener(() => {
  void startSession();
});
void startSession();

chrome.runtime.onMessage.addListener(
  (message: ExtensionRuntimeMessage, _sender, sendResponse) => {
    void handleMessage(message).then(sendResponse);
    return true;
  },
);

chrome.notifications.onClicked.addListener((notificationId) => {
  void onNotificationClicked(notificationId);
});

async function handleMessage(
  message: ExtensionRuntimeMessage,
): Promise<ExtensionStatus | { ok: true }> {
  if (message.type === extensionMessageTypes.sessionSet) {
    await writeApiBaseUrl(message.apiBaseUrl);
    await writeAccessToken(message.accessToken);
    await startSession();
    return { ok: true };
  }
  if (message.type === extensionMessageTypes.sessionClear) {
    await tearDown();
    await clearAccessToken();
    return { ok: true };
  }
  return readStatus();
}

async function startSession(): Promise<void> {
  await tearDownSocketAndPoll();
  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (accessToken === null || apiBaseUrl.length === 0) {
    bootstrap = null;
    return;
  }
  bootstrap = await fetchEdgeBootstrap({ apiBaseUrl, accessToken }).catch(
    () => null,
  );
  if (bootstrap === null || !bootstrap.allowed) {
    return;
  }
  if (bootstrap.wsEnabled) {
    attachSocket(apiBaseUrl, accessToken, bootstrap);
    return;
  }
  if (bootstrap.pollingFallbackEnabled) {
    beginPolling(apiBaseUrl, accessToken, bootstrap);
  }
}

function attachSocket(
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): void {
  socket = connectUserSocket({
    apiBaseUrl,
    accessToken,
    reconnectMaxBackoffSeconds: settings.reconnectMaxBackoffSeconds,
  });
  socket.on('connect', () => {
    connected = true;
    stopPolling?.();
    stopPolling = null;
  });
  socket.on('disconnect', () => {
    connected = false;
    if (settings.pollingFallbackEnabled) {
      beginPolling(apiBaseUrl, accessToken, settings);
    }
  });
  socket.on('notification.created', (payload: unknown) => {
    void handleNotificationCreated({
      payload: payload as never,
      bootstrap: settings,
      apiBaseUrl,
      accessToken,
    });
  });
}

function beginPolling(
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): void {
  if (stopPolling !== null) {
    return;
  }
  stopPolling = startUnreadPolling({
    intervalSeconds: settings.pollingIntervalSeconds,
    tick: () => {
      void pollUnread(apiBaseUrl, accessToken, settings);
    },
  });
}

async function pollUnread(
  apiBaseUrl: string,
  accessToken: string,
  settings: EdgeExtensionBootstrap,
): Promise<void> {
  const items = await fetchUnreadNotifications({ apiBaseUrl, accessToken });
  for (const item of items) {
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

async function onNotificationClicked(notificationId: string): Promise<void> {
  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (bootstrap === null || accessToken === null) {
    return;
  }
  openDeskUrl(bootstrap.deskPublicUrl, ticketIdForEvent(notificationId));
  if (bootstrap.receiptsEnabled) {
    await sendNotificationReceipt({
      apiBaseUrl,
      accessToken,
      notificationId,
      eventId: notificationId,
      kind: 'opened',
    });
  }
}

async function tearDown(): Promise<void> {
  await tearDownSocketAndPoll();
  resetEventDedup();
  bootstrap = null;
}

async function tearDownSocketAndPoll(): Promise<void> {
  stopPolling?.();
  stopPolling = null;
  connected = false;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

async function readStatus(): Promise<ExtensionStatus> {
  const token = await readAccessToken();
  return {
    signedIn: token !== null,
    allowed: bootstrap?.allowed === true,
    reason: bootstrap?.reason ?? 'UNAUTHENTICATED',
    connected,
    polling: stopPolling !== null,
    deskPublicUrl: bootstrap?.deskPublicUrl ?? '',
  };
}
