import type { NotificationRecord, NotificationResponse } from './notifications.types';
import type { NotificationType } from './notifications.constants';

export function toNotificationResponse(
  record: NotificationRecord,
): NotificationResponse {
  return {
    id: record.id,
    type: record.type as NotificationType,
    title: record.title,
    body: record.body,
    isRead: record.isRead,
    readAt: record.readAt?.toISOString() ?? null,
    ticketId: record.ticketId,
    payload: record.payload as NotificationResponse['payload'],
    createdAt: record.createdAt.toISOString(),
  };
}
