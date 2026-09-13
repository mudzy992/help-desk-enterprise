import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsError } from './notifications.error';
import type { NotificationResponse } from './notifications.types';
import { toNotificationResponse } from './to-notification-response';

export async function markNotificationRead(
  prisma: PrismaService,
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (updated.count === 0) {
    throw new NotificationsError('NOT_FOUND');
  }
  const record = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (record === null) {
    throw new NotificationsError('NOT_FOUND');
  }
  return toNotificationResponse(record);
}
