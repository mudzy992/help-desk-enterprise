import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import type { NotificationRecord } from '../notifications.types';
import { buildNotificationContent } from './build-notification-content';
import { mapTicketEventToNotification } from './map-ticket-event-to-notification';
import { insertNotificationBatch } from './insert-notification-batch';
import { resolveNotificationRecipients } from './resolve-notification-recipients';

export async function fanOutInAppNotifications(
  prisma: PrismaService,
  payload: TicketRealtimeMessagePayload,
): Promise<readonly NotificationRecord[]> {
  const mapped = mapTicketEventToNotification(payload);
  if (mapped === null) {
    return [];
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
  });
  if (ticket === null) {
    return [];
  }
  const recipientIds = await resolveNotificationRecipients(prisma, {
    type: mapped.type,
    ticket,
    actorUserId: payload.authorUserId,
    event: mapped.event,
    messageBody: payload.body,
  });
  const content = buildNotificationContent(
    mapped,
    ticket,
    payload.id,
    payload.authorUserId,
  );
  // Phase 2.3 (plan §2.3): one batch write for the whole recipient list, not one
  // insert per member.
  return insertNotificationBatch(prisma, {
    userIds: recipientIds,
    type: content.type,
    title: content.title,
    body: content.body,
    ticketId: ticket.id,
    payload: content.payload,
    dedupeKey: `${mapped.type}:${payload.id}`,
  });
}
