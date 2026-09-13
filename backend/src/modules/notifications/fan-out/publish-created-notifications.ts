import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketRealtimeEventNames } from '../../tickets/collaboration.constants';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { countUnreadNotifications } from '../count-unread-notifications';
import type { NotificationRecord } from '../notifications.types';
import { toNotificationResponse } from '../to-notification-response';

export async function publishCreatedNotifications(
  prisma: PrismaService,
  hub: TicketRealtimeHub,
  records: readonly NotificationRecord[],
): Promise<void> {
  for (const record of records) {
    const unreadCount = await countUnreadNotifications(prisma, record.userId);
    hub.publishNotification({
      userId: record.userId,
      eventName: ticketRealtimeEventNames.notificationCreated,
      notification: toNotificationResponse(record),
      unreadCount,
    });
  }
}
