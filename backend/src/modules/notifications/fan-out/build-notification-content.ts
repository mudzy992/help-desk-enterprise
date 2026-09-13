import { notificationTitleKeys, type NotificationType } from '../notifications.constants';
import type { NotificationPayload } from '../notifications.types';
import type { MappedTicketNotification } from './map-ticket-event-to-notification';

export function buildNotificationContent(
  mapped: MappedTicketNotification,
  ticket: {
    readonly id: string;
    readonly ticketNumber: string;
    readonly title: string;
    readonly isConfidential: boolean;
  },
  messageId: string,
  actorUserId: string | null,
): {
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string | null;
  readonly payload: NotificationPayload;
} {
  return {
    type: mapped.type,
    title: notificationTitleKeys[mapped.type],
    body: ticket.isConfidential ? ticket.ticketNumber : ticket.title,
    payload: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      event: mapped.event,
      messageId,
      actorUserId,
      confidential: ticket.isConfidential,
    },
  };
}
