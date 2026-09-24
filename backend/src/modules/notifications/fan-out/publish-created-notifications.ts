import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketRealtimeEventNames } from '../../tickets/collaboration.constants';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { countUnreadNotifications } from '../count-unread-notifications';
import { toNotificationResponse } from '../to-notification-response';
import type { FannedOutNotifications } from './fan-out-in-app-notifications';

export async function publishCreatedNotifications(
  prisma: PrismaService,
  hub: TicketRealtimeHub,
  created: FannedOutNotifications,
  dropCachedUnreadCount: (userId: string) => Promise<void> = async () => {},
  bumpGroupUnreadEpoch: (groupId: string) => Promise<void> = async () => {},
): Promise<void> {
  // Option A: the group row first — ONE emit into the group room, and one Redis INCR
  // that makes every member's cached badge a miss (no member list is read).
  if (created.group !== null && created.group.groupId) {
    await bumpGroupUnreadEpoch(created.group.groupId);
    hub.publishGroupNotification({
      groupId: created.group.groupId,
      notification: toNotificationResponse(created.group),
      excludedUserIds: created.group.excludedUserIds ?? [],
    });
  }
  const invalidated = new Set<string>();
  for (const record of created.personal) {
    if (record.userId === null || invalidated.has(record.userId)) {
      continue;
    }
    invalidated.add(record.userId);
    // Phase 1.3: the cached badge is dropped where it changes behind a poller's back.
    await dropCachedUnreadCount(record.userId);
    // Personal recipients are a handful (requester, assignee, watchers); their badge
    // includes their group rows, so it is counted per user, not grouped by `userId`.
    const unreadCount = await countUnreadNotifications(prisma, record.userId);
    hub.publishNotification({
      userId: record.userId,
      eventName: ticketRealtimeEventNames.notificationCreated,
      notification: toNotificationResponse(record),
      unreadCount,
    });
  }
}
