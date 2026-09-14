import {
  extensionMessageTypes,
  type ExtensionRuntimeMessage,
} from './lib/extension-messages';
import {
  ackEdgeRemote,
  clearEdgeSession,
  loadEdgeInbox,
  loadEdgeThread,
  onEdgeNotificationClicked,
  readEdgeStatus,
  sendEdgeReply,
  setEdgeSession,
  startEdgeSession,
} from './lib/edge-session';

chrome.runtime.onInstalled.addListener(() => {
  void startEdgeSession();
});
void startEdgeSession();

chrome.runtime.onMessage.addListener(
  (message: ExtensionRuntimeMessage, _sender, sendResponse) => {
    void dispatch(message).then(sendResponse).catch((error: unknown) => {
      sendResponse({
        error: error instanceof Error ? error.message : 'Request failed',
      });
    });
    return true;
  },
);

chrome.notifications.onClicked.addListener((notificationId) => {
  void onEdgeNotificationClicked(notificationId);
});

async function dispatch(message: ExtensionRuntimeMessage): Promise<unknown> {
  if (message.type === extensionMessageTypes.sessionSet) {
    await setEdgeSession(message.apiBaseUrl, message.accessToken);
    return { ok: true };
  }
  if (message.type === extensionMessageTypes.sessionClear) {
    await clearEdgeSession();
    return { ok: true };
  }
  if (message.type === extensionMessageTypes.inboxGet) {
    return { tickets: await loadEdgeInbox() };
  }
  if (message.type === extensionMessageTypes.threadGet) {
    return { messages: await loadEdgeThread(message.ticketId) };
  }
  if (message.type === extensionMessageTypes.replySend) {
    return sendEdgeReply(message.ticketId, message.body);
  }
  if (message.type === extensionMessageTypes.remoteAck) {
    await ackEdgeRemote(message.ticketId);
    return { ok: true };
  }
  return readEdgeStatus();
}
