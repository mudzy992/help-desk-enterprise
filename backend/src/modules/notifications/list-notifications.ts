import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationListLimits } from './notifications.constants';
import type {
  NotificationListQuery,
  NotificationListResponse,
} from './notifications.types';
import { countUnreadNotifications } from './count-unread-notifications';
import { toNotificationResponse } from './to-notification-response';

export async function listNotifications(
  prisma: PrismaService,
  userId: string,
  query: NotificationListQuery = {},
): Promise<NotificationListResponse> {
  const limit = Math.min(
    query.limit ?? notificationListLimits.default,
    notificationListLimits.maximum,
  );
  const items = await prisma.notification.findMany({
    where: {
      userId,
      ...(query.unreadOnly === true ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return {
    items: items.map(toNotificationResponse),
    unreadCount: await countUnreadNotifications(prisma, userId),
  };
}
