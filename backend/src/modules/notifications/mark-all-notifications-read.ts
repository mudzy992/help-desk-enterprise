import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadNotificationAudience,
  unreadGroupNotificationWhere,
} from './notification-audience';
import type { NotificationUnreadCountResponse } from './notifications.types';

export async function markAllNotificationsRead(
  prisma: PrismaService,
  userId: string,
): Promise<NotificationUnreadCountResponse> {
  const readAt = new Date();
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt },
  });
  // Option A: one receipt per unread group row the user can see.
  const memberships = await loadNotificationAudience(prisma, userId);
  const where = unreadGroupNotificationWhere(userId, memberships);
  if (where !== null) {
    const unread = (await prisma.notification.findMany({
      where,
      select: { id: true },
    })) as readonly { readonly id: string }[];
    if (unread.length > 0) {
      await prisma.notificationReceipt.createMany({
        data: unread.map((row) => ({ notificationId: row.id, userId, readAt })),
        skipDuplicates: true,
      });
    }
  }
  return { unreadCount: 0 };
}
