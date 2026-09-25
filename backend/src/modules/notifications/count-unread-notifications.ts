import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadNotificationAudience,
  visibleNotificationWhere,
} from './notification-audience';

/**
 * Staging k6 (2026-09-24): the SLA scanner left the perf agent ~50k unread
 * `ticket.sla` rows and every badge refresh counted all of them (400+ ms on a
 * cache miss). The bell shows "9+" and the panel a number, so the count stops at
 * this cap (`COUNT` over `LIMIT`); above it the badge reads the cap.
 */
export const unreadNotificationCountCap = 1000;

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
    take: unreadNotificationCountCap,
  });
}
