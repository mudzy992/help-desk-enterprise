import { fetchEdgeBootstrap, type EdgeExtensionBootstrap } from './bootstrap-client';
import {
  attachEdgeSocket,
  beginPolling,
  createEdgeSocketHandle,
  joinTicketRoom,
  tearDownEdgeSocket,
} from './edge-socket';
import { resetEventDedup, ticketIdForEvent } from './event-dedup';
import type { ExtensionStatus } from './extension-messages';
import {
  acknowledgeRemoteRequest,
  fetchExtensionThread,
  fetchPendingRemoteTicketIds,
  sendExtensionReply,
} from './extension-ticket-api';
import { fetchExtensionInbox } from './fetch-extension-inbox';
import {
  clearAccessToken,
  readAccessToken,
  readApiBaseUrl,
  writeAccessToken,
  writeApiBaseUrl,
} from './memory-token';
import { openDeskUrl } from './open-in-desk';
import {
  clearPendingRemoteTicketIds,
  forgetPendingRemote,
  mergePendingRemoteTicketIds,
  readPendingRemoteTicketIds,
} from './pending-remote';
import { sendNotificationReceipt } from './receipts-client';

const handle = createEdgeSocketHandle();
let bootstrap: EdgeExtensionBootstrap | null = null;

export async function startEdgeSession(): Promise<void> {
  tearDownEdgeSocket(handle);
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
  const pending = await fetchPendingRemoteTicketIds({
    apiBaseUrl,
    accessToken,
  }).catch(() => []);
  await mergePendingRemoteTicketIds(pending);
  if (bootstrap.wsEnabled) {
    attachEdgeSocket(handle, apiBaseUrl, accessToken, bootstrap);
    return;
  }
  if (bootstrap.pollingFallbackEnabled) {
    beginPolling(handle, apiBaseUrl, accessToken, bootstrap);
  }
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
  tearDownEdgeSocket(handle);
  resetEventDedup();
  await clearPendingRemoteTicketIds();
  bootstrap = null;
  await clearAccessToken();
}

export async function readEdgeStatus(): Promise<ExtensionStatus> {
  const token = await readAccessToken();
  return {
    signedIn: token !== null,
    allowed: bootstrap?.allowed === true,
    reason: bootstrap?.reason ?? 'UNAUTHENTICATED',
    connected: handle.connected,
    polling: handle.stopPolling !== null,
    deskPublicUrl: bootstrap?.deskPublicUrl ?? '',
    subjectId: bootstrap?.subjectId ?? '',
    chatEnabled: bootstrap?.chatEnabled !== false,
    remoteEnabled: bootstrap?.remoteEnabled !== false,
    pendingRemoteTicketIds: await readPendingRemoteTicketIds(),
  };
}

export async function loadEdgeInbox() {
  const access = await requireSession();
  return fetchExtensionInbox(access);
}

export async function loadEdgeThread(ticketId: string) {
  const access = await requireSession();
  joinTicketRoom(handle, ticketId);
  return fetchExtensionThread({
    ...access,
    ticketId,
    maxMessages: access.bootstrap.chatMaxMessagesPerTicket,
  });
}

export async function sendEdgeReply(ticketId: string, body: string) {
  const access = await requireSession();
  if (!access.bootstrap.chatEnabled) {
    throw new Error('Chat is disabled');
  }
  return sendExtensionReply({ ...access, ticketId, body });
}

export async function ackEdgeRemote(ticketId: string): Promise<void> {
  const access = await requireSession();
  await acknowledgeRemoteRequest({ ...access, ticketId });
  await forgetPendingRemote(ticketId);
}

export async function onEdgeNotificationClicked(
  notificationId: string,
): Promise<void> {
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

async function requireSession(): Promise<{
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly bootstrap: EdgeExtensionBootstrap;
  readonly subjectId: string;
}> {
  const accessToken = await readAccessToken();
  const apiBaseUrl = await readApiBaseUrl();
  if (accessToken === null || bootstrap === null || !bootstrap.allowed) {
    throw new Error('Not signed in');
  }
  return {
    apiBaseUrl,
    accessToken,
    bootstrap,
    subjectId: bootstrap.subjectId,
  };
}
