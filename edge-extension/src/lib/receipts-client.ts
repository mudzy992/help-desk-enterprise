import { helpdeskRequest } from './helpdesk-http';

/**
 * `POST /edge-extension/receipts` — AuditLog `notification.receipt`,
 * idempotentno po (user, notification, kind).
 */
export async function sendNotificationReceipt(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly notificationId: string;
  readonly eventId: string;
  readonly kind: 'delivered' | 'opened';
}): Promise<void> {
  await helpdeskRequest({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/edge-extension/receipts',
    method: 'POST',
    body: {
      notificationId: input.notificationId,
      eventId: input.eventId,
      kind: input.kind,
    },
  });
}

/** Fire-and-forget varijanta — greška ne smije prekinuti obradu eventa. */
export function sendNotificationReceiptQuietly(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly notificationId: string;
  readonly eventId: string;
  readonly kind: 'delivered' | 'opened';
}): void {
  void sendNotificationReceipt(input).catch(() => undefined);
}
