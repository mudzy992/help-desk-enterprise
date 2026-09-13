import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { buildNotificationContent } from './build-notification-content';
import { mapTicketEventToNotification } from './map-ticket-event-to-notification';
import { persistInAppNotification } from './persist-in-app-notification';
import { resolveNotificationRecipients } from './resolve-notification-recipients';

export async function fanOutInAppNotifications(
  prisma: PrismaService,
  payload: TicketRealtimeMessagePayload,
): Promise<void> {
  const mapped = mapTicketEventToNotification(payload);
  if (mapped === null) {
    return;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
  });
  if (ticket === null) {
    return;
  }
  const recipientIds = await resolveNotificationRecipients(prisma, {
    type: mapped.type,
    ticket,
    actorUserId: payload.authorUserId,
  });
  const content = buildNotificationContent(
    mapped,
    ticket,
    payload.id,
    payload.authorUserId,
  );
  const dedupeKey = `${mapped.type}:${payload.id}`;
  await Promise.all(
    recipientIds.map((userId) =>
      persistInAppNotification(prisma, {
        userId,
        type: content.type,
        title: content.title,
        body: content.body,
        ticketId: ticket.id,
        payload: content.payload,
        dedupeKey,
      }),
    ),
  );
}
