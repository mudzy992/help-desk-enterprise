import type { EdgeExtensionBootstrap } from './bootstrap-client';
import { rememberEventId, rememberTicketForEvent } from './event-dedup';
import { sendNotificationReceipt } from './receipts-client';
import { showRedactedToast } from './redacted-toast';

type NotificationCreatedPayload = {
  readonly eventId?: string;
  readonly createdAt?: string;
  readonly notification?: {
    readonly id: string;
    readonly type: string;
    readonly title?: string | null;
    readonly body?: string | null;
    readonly ticketId: string | null;
    readonly payload?: { readonly serviceName?: string } | null;
  } | null;
};

export async function handleNotificationCreated(input: {
  readonly payload: NotificationCreatedPayload;
  readonly bootstrap: EdgeExtensionBootstrap;
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<void> {
  const notification = input.payload.notification;
  if (notification === null || notification === undefined) {
    return;
  }
  const eventId = input.payload.eventId ?? notification.id;
  if (!rememberEventId(eventId, input.bootstrap.dedupEnabled)) {
    return;
  }
  rememberTicketForEvent(eventId, notification.ticketId);
  await showRedactedToast({
    eventId,
    type: notification.type,
    ticketId: notification.ticketId,
    serviceName: notification.payload?.serviceName,
  });
  if (input.bootstrap.receiptsEnabled) {
    await sendNotificationReceipt({
      apiBaseUrl: input.apiBaseUrl,
      accessToken: input.accessToken,
      notificationId: notification.id,
      eventId,
      kind: 'delivered',
    });
  }
}
