import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationListLimits } from './notifications.constants';
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
  const limit = Math.min(
    query.limit ?? notificationListLimits.default,
    notificationListLimits.maximum,
  );
  const memberships = await loadNotificationAudience(prisma, userId);
  const items = (await prisma.notification.findMany({
    where: visibleNotificationWhere(userId, memberships, {
      unreadOnly: query.unreadOnly === true,
    }),
    orderBy: { createdAt: 'desc' },
    take: limit,
    // Only the caller's own receipt; personal rows simply have none.
    ...(memberships.length === 0
      ? {}
      : { include: { receipts: { where: { userId }, select: { readAt: true } } } }),
  })) as readonly ListedNotification[];
  return {
    items: items.map((item) => {
      if (item.userId !== null) {
        return toNotificationResponse(item);
      }
      const receipt = item.receipts?.[0];
      return toNotificationResponse(item, {
        isRead: receipt !== undefined,
        readAt: receipt?.readAt ?? null,
      });
    }),
    unreadCount: await countUnreadNotifications(prisma, userId),
  };
}
