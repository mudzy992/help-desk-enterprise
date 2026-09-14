import { helpdeskRequest } from './helpdesk-http';

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
