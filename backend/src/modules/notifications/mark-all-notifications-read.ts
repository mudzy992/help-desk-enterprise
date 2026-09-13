import { PrismaService } from '../../common/prisma/prisma.service';
import type { NotificationUnreadCountResponse } from './notifications.types';

export async function markAllNotificationsRead(
  prisma: PrismaService,
  userId: string,
): Promise<NotificationUnreadCountResponse> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { unreadCount: 0 };
}
