import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketRealtimeEventNames } from '../../tickets/collaboration.constants';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { loadUnreadCountsForUsers } from '../load-unread-counts-for-users';
import type { NotificationRecord } from '../notifications.types';
import { toNotificationResponse } from '../to-notification-response';

export async function publishCreatedNotifications(
  prisma: PrismaService,
  hub: TicketRealtimeHub,
  records: readonly NotificationRecord[],
  dropCachedUnreadCount: (userId: string) => Promise<void> = async () => {},
): Promise<void> {
  if (records.length === 0) {
    return;
  }
  // Phase 2.3 (plan §2.3): one `GROUP BY` answers the badge for every recipient
  // of the event (before: one count query per record).
  const unreadCounts = await loadUnreadCountsForUsers(
    prisma,
    records.map((record) => record.userId),
  );
  const invalidated = new Set<string>();
  for (const record of records) {
    const unreadCount = unreadCounts.get(record.userId) ?? 0;
    // Phase 1.3 (plan §1.3): the fan-out is where the badge changes behind a
    // poller's back, so the cached value is dropped right here (the default is
    // a no-op, and the callers that have a cache pass the drop function). It is
    // dropped rather than overwritten on purpose: the count above was read
    // while the new row may still be invisible to other readers, a miss costs
    // one query, and the drop itself never fails the fan-out.
    if (!invalidated.has(record.userId)) {
      invalidated.add(record.userId);
      await dropCachedUnreadCount(record.userId);
    }
    hub.publishNotification({
      userId: record.userId,
      eventName: ticketRealtimeEventNames.notificationCreated,
      notification: toNotificationResponse(record),
      unreadCount,
    });
  }
}
