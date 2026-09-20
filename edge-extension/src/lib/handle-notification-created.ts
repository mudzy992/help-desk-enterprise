import type { EdgeExtensionBootstrap } from './bootstrap-client';
import { rememberEventId, rememberEventMeta } from './event-dedup';
import { rememberPendingRemote } from './pending-remote';
import { sendNotificationReceiptQuietly } from './receipts-client';
import { showRedactedToast } from './redacted-toast';

/**
 * Obrada jednog `notification.created` eventa (WS ili polling).
 * Isti `eventId` može stići iz oba kanala (EDGE_EVENT queue + WS) — dedup
 * osigurava da korisnik vidi tačno jedan toast i da se receipt pošalje
 * tačno jednom.
 */
export type NotificationRealtimePayload = {
  readonly eventId?: string;
  readonly notification?: {
    readonly id: string;
    readonly type: string;
    readonly title?: string | null;
    readonly body?: string | null;
    readonly isRead?: boolean;
    readonly ticketId: string | null;
    readonly payload?: {
      readonly ticketNumber?: string;
      readonly serviceName?: string;
    } | null;
  } | null;
  readonly unreadCount?: number;
};

export type NotificationHandlingResult = {
  /** true = novi, ne-duplikat event koji je stvarno obradio klijent. */
  readonly accepted: boolean;
  readonly unreadCount: number | null;
  readonly isRemoteRequest: boolean;
};

export async function handleNotificationCreated(input: {
  readonly payload: NotificationRealtimePayload;
  readonly bootstrap: EdgeExtensionBootstrap;
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<NotificationHandlingResult> {
  const unreadCount =
    typeof input.payload.unreadCount === 'number'
      ? input.payload.unreadCount
      : null;

  const notification = input.payload.notification ?? null;
  if (notification === null || typeof notification.id !== 'string' || notification.id.length === 0) {
    // readAll / count-only envelope — ništa za toast.
    return { accepted: false, unreadCount, isRemoteRequest: false };
  }

  const eventId =
    typeof input.payload.eventId === 'string' && input.payload.eventId.length > 0
      ? input.payload.eventId
      : notification.id;

  if (!rememberEventId(eventId, input.bootstrap.dedupEnabled)) {
    return { accepted: false, unreadCount, isRemoteRequest: false };
  }

  const ticketId =
    typeof notification.ticketId === 'string' && notification.ticketId.length > 0
      ? notification.ticketId
      : null;
  rememberEventMeta(eventId, ticketId, notification.id);

  const isRemoteRequest = notification.type === 'remote.requested';
  if (isRemoteRequest && ticketId !== null) {
    await rememberPendingRemote(ticketId);
  }

  await showRedactedToast({
    eventId,
    type: notification.type,
    ticketId,
    ticketNumber: notification.payload?.ticketNumber ?? null,
    serviceName: notification.payload?.serviceName,
  });

  if (input.bootstrap.receiptsEnabled) {
    sendNotificationReceiptQuietly({
      apiBaseUrl: input.apiBaseUrl,
      accessToken: input.accessToken,
      notificationId: notification.id,
      eventId,
      kind: 'delivered',
    });
  }

  return { accepted: true, unreadCount, isRemoteRequest };
}
