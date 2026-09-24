import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadNotificationAudience,
  visibleNotificationWhere,
} from './notification-audience';

/**
 * Unread badge: personal unread rows + group rows without a receipt (Option A).
 * One `COUNT` either way — the group part is an `OR` branch of the same statement.
 */
export async function countUnreadNotifications(
  prisma: PrismaService,
  userId: string,
): Promise<number> {
  const memberships = await loadNotificationAudience(prisma, userId);
  return prisma.notification.count({
    where: visibleNotificationWhere(userId, memberships, { unreadOnly: true }),
  });
}
