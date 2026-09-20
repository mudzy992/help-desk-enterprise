import {
  fetchEdgeBootstrap,
  type EdgeExtensionBootstrap,
} from './bootstrap-client';
import { updateUnreadBadge } from './badge-counter';
import {
  attachEdgeSocket,
  createEdgeSocketHandle,
  joinTicketRoom,
  leaveTicketRoom,
  tearDownEdgeSocket,
  type EdgeSocketCallbacks,
} from './edge-socket';
import {
  eventMetaFor,
  resetEventDedup,
  ticketIdForEvent,
} from './event-dedup';
import type {
  ExtensionInboxTicket,
  ExtensionStatus,
  ExtensionThreadMessage,
} from './extension-messages';
import {
  acknowledgeRemoteRequest,
  fetchExtensionThread,
  fetchPendingRemoteTicketIds,
  sendExtensionReply,
} from './extension-ticket-api';
import { fetchExtensionInbox } from './fetch-extension-inbox';
import {
  isExtensionVisibleMessageType,
  normalizeThreadMessage,
} from './filter-extension-chat';
import {
  clearPollAlarm,
  edgePollAlarmName,
  ensurePollAlarm,
  fetchUnreadNotifications,
} from './polling-fallback';
import {
  handleNotificationCreated,
  type NotificationRealtimePayload,
} from './handle-notification-created';
import {
  AuthExpiredError,
  HelpdeskHttpError,
  helpdeskRequest,
} from './helpdesk-http';
import {
  clearAccessToken,
  readAccessToken,
  readApiBaseUrl,
  writeAccessToken,
  writeApiBaseUrl,
  writeStoredLanguage,
} from './memory-token';
import { openDeskUrl } from './open-in-desk';
import { broadcastToPopups } from './popup-bridge';
import {
  clearPendingRemoteTicketIds,
  forgetPendingRemote,
  mergePendingRemoteTicketIds,
  readPendingRemoteTicketIds,
} from './pending-remote';
import { clearToast } from './redacted-toast';
import { sendNotificationReceiptQuietly } from './receipts-client';

/**
 * Orkestrator sesije — jedino mjesto koje drži WS/poll/badge/remote stanje.
 * Popup je "glup" renderer; sve odluke (kill switch, fallback, dedup,
 * receipts, Quick Assist lifecycle) žive ovdje.
 */
const handle = createEdgeSocketHandle();

let bootstrap: EdgeExtensionBootstrap | null = null;
let displayName: string | null = null;
let watchedTicketId: string | null = null;
let lastUnreadCount = 0;
let startSequence = 0;
let sessionSalt = 0; // ignoriraj stare WS callbackove nakon restarta

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startEdgeSession(): Promise<void> {
  const mySequence = ++startSequence;
  const mySalt = ++sessionSalt;
  tearDownEdgeSocket(handle);

  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (mySequence !== startSequence) {
    return;
  }
  if (accessToken === null || apiBaseUrl.length === 0) {
    bootstrap = null;
    await clearPollAlarm();
    await setUnreadCount(0, false);
    broadcastStatus();
    return;
  }

  try {
    bootstrap = await fetchEdgeBootstrap({ apiBaseUrl, accessToken });
  } catch (error) {
    if (error instanceof AuthExpiredError) {
      await clearEdgeSession();
      return;
    }
    // Mrežna greška: korisnik ostaje prijavljen, popup prikazuje Offline.
    bootstrap = null;
    broadcastStatus();
    return;
  }
  if (mySequence !== startSequence) {
    return;
  }

  if (!bootstrap.allowed) {
    await clearPollAlarm();
    await setUnreadCount(0, false);
    broadcastStatus();
    return;
  }

  const pendingTicketIds = await fetchPendingRemoteTicketIds({
    apiBaseUrl,
    accessToken,
  }).catch(() => [] as readonly string[]);
  await mergePendingRemoteTicketIds(pendingTicketIds);

  // Dohvati ime korisnika — fire & forget, ne blokira bootstrap.
  void fetchDisplayName(apiBaseUrl, accessToken);

  try {
    const page = await fetchUnreadNotifications({ apiBaseUrl, accessToken });
    await setUnreadCount(page.unreadCount, false);
  } catch (error) {
    if (error instanceof AuthExpiredError) {
      await clearEdgeSession();
      return;
    }
  }

  if (bootstrap.wsEnabled) {
    attachEdgeSocket(
      handle,
      apiBaseUrl,
      accessToken,
      bootstrap,
      buildSocketCallbacks(apiBaseUrl, accessToken, mySalt),
    );
    if (bootstrap.pollingFallbackEnabled) {
      await ensurePollAlarm(bootstrap.pollingIntervalSeconds);
    }
  } else if (bootstrap.pollingFallbackEnabled) {
    await ensurePollAlarm(bootstrap.pollingIntervalSeconds);
    await pollNow();
  } else {
    await clearPollAlarm();
  }

  broadcastStatus();
}

export async function setEdgeSession(
  apiBaseUrl: string,
  accessToken: string,
): Promise<void> {
  await writeApiBaseUrl(apiBaseUrl);
  await writeAccessToken(accessToken);
  await startEdgeSession();
}

export async function clearEdgeSession(): Promise<void> {
  startSequence += 1;
  sessionSalt += 1;
  tearDownEdgeSocket(handle);
  resetEventDedup();
  watchedTicketId = null;
  bootstrap = null;
  displayName = null;
  await clearPollAlarm();
  await clearPendingRemoteTicketIds();
  await setUnreadCount(0, false);
  await clearAccessToken();
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function readEdgeStatus(): Promise<ExtensionStatus> {
  const token = await readAccessToken();
  return {
    signedIn: token !== null,
    allowed: bootstrap?.allowed === true,
    // 'UNREACHABLE' = bootstrap nije stigao (mreža) — nije isto što i deny.
    reason: bootstrap?.reason ?? (token !== null ? 'UNREACHABLE' : 'UNAUTHENTICATED'),
    connected: handle.connected,
    polling: bootstrap?.pollingFallbackEnabled === true && !handle.connected,
    deskPublicUrl: bootstrap?.deskPublicUrl ?? '',
    subjectId: bootstrap?.subjectId ?? '',
    displayName,
    chatEnabled: bootstrap?.chatEnabled !== false,
    remoteEnabled: bootstrap?.remoteEnabled !== false,
    pendingRemoteTicketIds: await readPendingRemoteTicketIds(),
    unreadCount: lastUnreadCount,
  };
}

export function broadcastStatus(): void {
  void readEdgeStatus().then((status) => {
    broadcastToPopups({ type: 'status.changed', status });
  });
}

async function setUnreadCount(count: number, broadcast = true): Promise<void> {
  if (count === lastUnreadCount) {
    return;
  }
  lastUnreadCount = count;
  await updateUnreadBadge(count);
  if (broadcast) {
    broadcastStatus();
  }
}

// ---------------------------------------------------------------------------
// Inbox / thread / reply / remote
// ---------------------------------------------------------------------------

export async function loadEdgeInbox(): Promise<readonly ExtensionInboxTicket[]> {
  const access = await requireSession();
  return fetchExtensionInbox(access);
}

export async function loadEdgeThread(
  ticketId: string,
): Promise<readonly ExtensionThreadMessage[]> {
  const access = await requireSession();
  return fetchExtensionThread({
    ...access,
    ticketId,
    maxMessages: access.bootstrap.chatMaxMessagesPerTicket,
  });
}

export async function sendEdgeReply(
  ticketId: string,
  body: string,
): Promise<ExtensionThreadMessage> {
  const access = await requireSession();
  if (!access.bootstrap.chatEnabled) {
    throw new Error('Chat is disabled');
  }
  const sent = await sendExtensionReply({ ...access, ticketId, body });
  broadcastToPopups({ type: 'inbox.refresh' });
  return sent;
}

export async function ackEdgeRemote(ticketId: string): Promise<void> {
  const access = await requireSession();
  await acknowledgeRemoteRequest({ ...access, ticketId });
  await forgetPendingRemote(ticketId);
  broadcastStatus();
}

/** Popup otvori/zatvori thread → ulaz/izlaz iz WS sobe tiketa. */
export function watchThread(ticketId: string | null): void {
  if (watchedTicketId !== null && watchedTicketId !== ticketId) {
    leaveTicketRoom(handle, watchedTicketId);
  }
  watchedTicketId = ticketId;
  if (ticketId !== null && handle.connected) {
    joinTicketRoom(handle, ticketId);
  }
}

// ---------------------------------------------------------------------------
// OS notifikacije (klik / gumb)
// ---------------------------------------------------------------------------

export async function onEdgeNotificationClicked(
  chromeNotificationId: string,
): Promise<void> {
  const accessToken = await readAccessToken();
  if (bootstrap === null || accessToken === null) {
    return;
  }
  await clearToast(chromeNotificationId);

  const meta = eventMetaFor(chromeNotificationId);
  openDeskUrl(bootstrap.deskPublicUrl, meta?.ticketId ?? ticketIdForEvent(chromeNotificationId));

  if (bootstrap.receiptsEnabled && meta !== null) {
    sendNotificationReceiptQuietly({
      apiBaseUrl: await readApiBaseUrl(),
      accessToken,
      notificationId: meta.notificationId,
      eventId: chromeNotificationId,
      kind: 'opened',
    });
  }

  try {
    const page = await fetchUnreadNotifications({
      apiBaseUrl: await readApiBaseUrl(),
      accessToken,
    });
    await setUnreadCount(page.unreadCount);
  } catch {
    // Badge će se uskladiti na sljedećem eventu/pollu.
  }
}

// ---------------------------------------------------------------------------
// Polling (chrome.alarms)
// ---------------------------------------------------------------------------

export async function handlePollAlarm(alarm: { readonly name: string }): Promise<void> {
  if (alarm.name !== edgePollAlarmName) {
    return;
  }
  await pollNow();
}

export async function pollNow(): Promise<void> {
  if (bootstrap === null || !bootstrap.allowed) {
    return;
  }
  if (!bootstrap.pollingFallbackEnabled) {
    return;
  }
  if (bootstrap.wsEnabled && handle.connected) {
    return; // WS zdrav — polling je samo fallback.
  }
  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (accessToken === null || apiBaseUrl.length === 0) {
    return;
  }
  try {
    const page = await fetchUnreadNotifications({ apiBaseUrl, accessToken });
    await setUnreadCount(page.unreadCount);
    let anyNew = false;
    for (const item of page.items) {
      const result = await handleNotificationCreated({
        payload: { eventId: item.id, notification: item },
        bootstrap,
        apiBaseUrl,
        accessToken,
      });
      anyNew = anyNew || result.accepted;
    }
    if (anyNew) {
      broadcastToPopups({ type: 'inbox.refresh' });
    }
  } catch (error) {
    if (error instanceof AuthExpiredError) {
      await clearEdgeSession();
    }
  }
}

// ---------------------------------------------------------------------------
// Socket callbacks
// ---------------------------------------------------------------------------

function buildSocketCallbacks(
  apiBaseUrl: string,
  accessToken: string,
  mySalt: number,
): EdgeSocketCallbacks {
  const isCurrent = (): boolean => mySalt === sessionSalt;
  return {
    getWatchedTicketId: () => watchedTicketId,

    onConnectionChange: (connected) => {
      if (!isCurrent()) {
        return;
      }
      if (!connected && bootstrap?.pollingFallbackEnabled === true) {
        void ensurePollAlarm(bootstrap.pollingIntervalSeconds);
      }
      broadcastStatus();
    },

    onConnectError: (message) => {
      if (!isCurrent()) {
        return;
      }
      if (/auth/i.test(message)) {
        // Token više ne prolazi WS handshake → revalidiraj kroz REST.
        void fetchEdgeBootstrap({ apiBaseUrl, accessToken }).catch((error) => {
          if (error instanceof AuthExpiredError) {
            void clearEdgeSession();
          }
        });
      }
      broadcastStatus();
    },

    onNotificationCreated: (payload: unknown) => {
      if (!isCurrent() || bootstrap === null) {
        return;
      }
      const settings = bootstrap;
      void handleNotificationCreated({
        payload: payload as NotificationRealtimePayload,
        bootstrap: settings,
        apiBaseUrl,
        accessToken,
      }).then(async (result) => {
        if (result.unreadCount !== null) {
          await setUnreadCount(result.unreadCount, false);
        }
        if (result.accepted) {
          broadcastToPopups({ type: 'inbox.refresh' });
        }
        if (result.isRemoteRequest || result.unreadCount !== null) {
          broadcastStatus();
        }
      });
    },

    onUnreadCount: (unreadCount) => {
      if (!isCurrent()) {
        return;
      }
      void setUnreadCount(unreadCount);
    },

    onTicketMessage: (payload: unknown) => {
      if (!isCurrent()) {
        return;
      }
      const envelope = payload as {
        readonly ticketId?: unknown;
        readonly message?: unknown;
      };
      const ticketId =
        typeof envelope.ticketId === 'string' ? envelope.ticketId : null;
      if (ticketId === null || ticketId !== watchedTicketId) {
        if (ticketId !== null) {
          broadcastToPopups({ type: 'inbox.refresh' });
        }
        return;
      }
      const message = normalizeThreadMessage(envelope.message);
      if (message === null || !isExtensionVisibleMessageType(message.type)) {
        return;
      }
      broadcastToPopups({ type: 'thread.message', ticketId, message });
      broadcastToPopups({ type: 'inbox.refresh' });
    },

    onTicketUpdated: (payload: unknown) => {
      if (!isCurrent()) {
        return;
      }
      const envelope = payload as { readonly ticketId?: unknown };
      const ticketId =
        typeof envelope.ticketId === 'string' ? envelope.ticketId : null;
      if (ticketId !== null && ticketId === watchedTicketId) {
        broadcastToPopups({ type: 'thread.refresh', ticketId });
      }
      broadcastToPopups({ type: 'inbox.refresh' });
    },
  };
}

// ---------------------------------------------------------------------------
// Interno
// ---------------------------------------------------------------------------

async function requireSession(): Promise<{
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly bootstrap: EdgeExtensionBootstrap;
  readonly subjectId: string;
}> {
  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (accessToken === null || apiBaseUrl.length === 0) {
    throw new AuthExpiredError();
  }
  if (bootstrap === null) {
    throw new HelpdeskHttpError(
      0,
      'Server nije dostupan. Provjerite mrežu i pokušajte ponovo.',
      'NETWORK',
    );
  }
  if (!bootstrap.allowed) {
    throw new Error('HelpDesk modul je trenutno onemogućen.');
  }
  return { apiBaseUrl, accessToken, bootstrap, subjectId: bootstrap.subjectId };
}

async function fetchDisplayName(
  apiBaseUrl: string,
  accessToken: string,
): Promise<void> {
  try {
    const session = await helpdeskRequest<{
      readonly user?: { readonly displayName?: unknown; readonly name?: unknown; readonly email?: unknown } | null;
      readonly displayName?: unknown;
      readonly email?: unknown;
    }>({
      apiBaseUrl,
      accessToken,
      path: '/auth/session',
    });
    // Backend može vratiti različite oblike
    const raw =
      session.user?.displayName ??
      session.user?.name ??
      session.displayName ??
      session.user?.email ??
      session.email;
    displayName = typeof raw === 'string' && raw.length > 0 ? raw : null;
    broadcastStatus();
  } catch {
    // Tihi fail — displayName ostaje null, nema crash
  }
}

/** Mijenja jezik i broadcastuje novi status da popup odmah re-renderuje. */
export async function setStoredLanguage(lang: 'bs' | 'en'): Promise<void> {
  await writeStoredLanguage(lang);
  broadcastStatus();
}
