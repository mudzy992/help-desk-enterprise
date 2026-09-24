import type { NotificationRecord, NotificationResponse } from './notifications.types';
import type { NotificationType } from './notifications.constants';

/**
 * `readState` overrides the row's own flags for group notifications, whose read state
 * is the caller's `NotificationReceipt` (Option A), not a column on the shared row.
 */
export function toNotificationResponse(
  record: NotificationRecord,
  readState?: { readonly isRead: boolean; readonly readAt: Date | null },
): NotificationResponse {
  const isGroup = record.userId === null;
  const isRead = readState?.isRead ?? (isGroup ? false : record.isRead);
  const readAt = readState?.readAt ?? (isGroup ? null : record.readAt);
  return {
    id: record.id,
    type: record.type as NotificationType,
    title: record.title,
    body: record.body,
    isRead,
    readAt: readAt?.toISOString() ?? null,
    ticketId: record.ticketId,
    payload: record.payload as NotificationResponse['payload'],
    createdAt: record.createdAt.toISOString(),
  };
}
