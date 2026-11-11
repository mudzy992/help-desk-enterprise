import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationListLimits } from './notifications.constants';
import {
  decodeNotificationListCursor,
  encodeNotificationListCursor,
} from './notification-list-cursor';
import type {
  NotificationListQuery,
  NotificationListResponse,
  NotificationRecord,
} from './notifications.types';
import { countUnreadNotifications } from './count-unread-notifications';
import {
  loadNotificationAudience,
  visibleNotificationWhere,
} from './notification-audience';
import { toNotificationResponse } from './to-notification-response';

type ListedNotification = NotificationRecord & {
  readonly receipts?: readonly { readonly readAt: Date }[];
};

export async function listNotifications(
  prisma: PrismaService,
  userId: string,
  query: NotificationListQuery = {},
): Promise<NotificationListResponse> {
  const requestedLimit = query.limit ?? notificationListLimits.default;
  const limit = Math.max(
    1,
    Math.min(
      Number.isFinite(requestedLimit)
        ? Math.trunc(requestedLimit)
        : notificationListLimits.default,
      notificationListLimits.maximum,
    ),
  );
  const unreadOnly = query.unreadOnly === true;
  const cursor = decodeNotificationListCursor(query.cursor, userId, unreadOnly);
  const memberships = await loadNotificationAudience(prisma, userId);
  const visibleWhere = visibleNotificationWhere(userId, memberships, { unreadOnly });
  const where =
    cursor === null
      ? visibleWhere
      : {
          AND: [
            visibleWhere,
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        };
  const records = (await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    // Only the caller's own receipt; personal rows simply have none.
    ...(memberships.length === 0
      ? {}
      : { include: { receipts: { where: { userId }, select: { readAt: true } } } }),
  })) as readonly ListedNotification[];
  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, limit) : records;
  const last = pageRecords.at(-1);

  return {
    items: pageRecords.map((item) => {
      if (item.userId !== null) {
        return toNotificationResponse(item);
      }
      const receipt = item.receipts?.[0];
      return toNotificationResponse(item, {
        isRead: receipt !== undefined,
        readAt: receipt?.readAt ?? null,
      });
    }),
    unreadCount: await countUnreadNotifications(prisma, userId, memberships),
    hasMore,
    nextCursor:
      hasMore && last !== undefined
        ? encodeNotificationListCursor(last, userId, unreadOnly)
        : null,
  };
}
