import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import type { NotificationRecord } from '../notifications.types';
import { buildNotificationContent } from './build-notification-content';
import { insertGroupNotification } from './insert-group-notification';
import { mapTicketEventToNotification } from './map-ticket-event-to-notification';
import { insertNotificationBatch } from './insert-notification-batch';
import { resolveNotificationAudience } from './resolve-notification-recipients';

/** What one event wrote: personal rows (few) and at most one group row. */
export type FannedOutNotifications = {
  readonly personal: readonly NotificationRecord[];
  readonly group: NotificationRecord | null;
};

export const noFannedOutNotifications: FannedOutNotifications = {
  personal: [],
  group: null,
};

export async function fanOutInAppNotifications(
  prisma: PrismaService,
  payload: TicketRealtimeMessagePayload,
): Promise<FannedOutNotifications> {
  const mapped = mapTicketEventToNotification(payload);
  if (mapped === null) {
    return noFannedOutNotifications;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
  });
  if (ticket === null) {
    return noFannedOutNotifications;
  }
  const audience = await resolveNotificationAudience(prisma, {
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
  const dedupeKey = `${mapped.type}:${payload.id}`;
  // Phase 2.3: one batch write for the personal recipients; Option A: one row for the
  // group, whatever its size.
  const personal = await insertNotificationBatch(prisma, {
    userIds: audience.userIds,
    type: content.type,
    title: content.title,
    body: content.body,
    ticketId: ticket.id,
    payload: content.payload,
    dedupeKey,
  });
  const group =
    audience.group === null
      ? null
      : await insertGroupNotification(prisma, {
          groupId: audience.group.groupId,
          excludedUserIds: audience.group.excludedUserIds,
          type: content.type,
          title: content.title,
          body: content.body,
          ticketId: ticket.id,
          payload: content.payload,
          dedupeKey,
        });
  return { personal, group };
}
