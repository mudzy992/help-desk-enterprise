import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isNotificationVisibleTo,
  loadNotificationAudience,
} from './notification-audience';
import { NotificationsError } from './notifications.error';
import type { NotificationRecord, NotificationResponse } from './notifications.types';
import { toNotificationResponse } from './to-notification-response';

/**
 * Personal row: flips its own `isRead`. Group row (Option A): writes the caller's
 * receipt — idempotent (`skipDuplicates`), the shared row is never touched, so one
 * member reading it does not mark it read for the others.
 */
export async function markNotificationRead(
  prisma: PrismaService,
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> {
  const personal = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (personal.count > 0) {
    const record = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (record === null) {
      throw new NotificationsError('NOT_FOUND');
    }
    return toNotificationResponse(record as NotificationRecord);
  }
  const record = (await prisma.notification.findFirst({
    where: { id: notificationId, userId: null },
  })) as NotificationRecord | null;
  const memberships = await loadNotificationAudience(prisma, userId);
  if (record === null || !isNotificationVisibleTo(record, userId, memberships)) {
    throw new NotificationsError('NOT_FOUND');
  }
  const readAt = new Date();
  await prisma.notificationReceipt.createMany({
    data: [{ notificationId, userId, readAt }],
    skipDuplicates: true,
  });
  return toNotificationResponse(record, { isRead: true, readAt });
}
