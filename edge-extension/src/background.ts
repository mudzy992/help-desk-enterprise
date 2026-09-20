import {
  extensionMessageTypes,
  popupPortName,
  type ExtensionErrorResponse,
  type ExtensionRuntimeMessage,
} from './lib/extension-messages';
import {
  ackEdgeRemote,
  clearEdgeSession,
  handlePollAlarm,
  loadEdgeInbox,
  loadEdgeThread,
  onEdgeNotificationClicked,
  readEdgeStatus,
  sendEdgeReply,
  setEdgeSession,
  setStoredLanguage,
  startEdgeSession,
  watchThread,
} from './lib/edge-session';
import { AuthExpiredError, HelpdeskHttpError } from './lib/helpdesk-http';
import { registerPopupPort } from './lib/popup-bridge';

/**
 * MV3 service worker — tanki entry.
 * Sva pravila žive u `lib/edge-session.ts`; ovdje je samo životni ciklus
 * browsera (startup/install/wake) i rutiranje poruka.
 */

chrome.runtime.onInstalled.addListener(() => {
  void startEdgeSession();
});

chrome.runtime.onStartup.addListener(() => {
  void startEdgeSession();
});

// SW se budi i na druge događaje (alarm, notifikacija, poruka) — obnovi
// stanje iz `chrome.storage.session` ako postoji.
void startEdgeSession();

chrome.runtime.onMessage.addListener(
  (message: ExtensionRuntimeMessage, _sender, sendResponse: (response?: unknown) => void) => {
    dispatch(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        void mapFailure(error).then(sendResponse);
      });
    return true; // asinhroni odgovor
  },
);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === popupPortName) {
    registerPopupPort(port);
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void onEdgeNotificationClicked(notificationId);
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  void onEdgeNotificationClicked(notificationId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handlePollAlarm(alarm);
});

async function dispatch(message: ExtensionRuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case extensionMessageTypes.sessionSet: {
      await setEdgeSession(message.apiBaseUrl, message.accessToken);
      return { ok: true };
    }
    case extensionMessageTypes.sessionClear: {
      await clearEdgeSession();
      return { ok: true };
    }
    case extensionMessageTypes.inboxGet: {
      return { tickets: await loadEdgeInbox() };
    }
    case extensionMessageTypes.threadGet: {
      return { messages: await loadEdgeThread(message.ticketId) };
    }
    case extensionMessageTypes.threadWatch: {
      watchThread(message.ticketId);
      return { ok: true };
    }
    case extensionMessageTypes.replySend: {
      return { message: await sendEdgeReply(message.ticketId, message.body) };
    }
    case extensionMessageTypes.remoteAck: {
      await ackEdgeRemote(message.ticketId);
      return { ok: true };
    }
    case extensionMessageTypes.languageSet: {
      await setStoredLanguage(message.language);
      return { ok: true };
    }
    case extensionMessageTypes.statusGet:
    default: {
      return readEdgeStatus();
    }
  }
}

async function mapFailure(error: unknown): Promise<ExtensionErrorResponse> {
  if (error instanceof AuthExpiredError) {
    await clearEdgeSession();
    return {
      error: error.message,
      code: 'AUTH_EXPIRED',
      authExpired: true,
    };
  }
  if (error instanceof HelpdeskHttpError) {
    return { error: error.message, code: error.code };
  }
  return {
    error: error instanceof Error ? error.message : 'Zahtjev nije uspio.',
  };
}
