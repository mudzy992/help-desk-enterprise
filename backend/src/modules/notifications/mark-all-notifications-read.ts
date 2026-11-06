import { PrismaService } from '../../common/prisma/prisma.service';
import { countUnreadNotifications } from './count-unread-notifications';
import { notificationMarkAllLimits } from './notifications.constants';
import {
  loadNotificationAudience,
  unreadGroupNotificationWhere,
} from './notification-audience';
import type { NotificationUnreadCountResponse } from './notifications.types';

// One bounded retry covers transient RepeatableRead write conflicts (Prisma P2034).
const maxMarkAllTransactionAttempts = 2;

export async function markAllNotificationsRead(
  prisma: PrismaService,
  userId: string,
  now: () => Date = () => new Date(),
): Promise<NotificationUnreadCountResponse> {
  // Freeze the server-side read boundary before starting the transaction. The
  // repeatable-read snapshot prevents a row committed between the personal and
  // group steps from appearing halfway through this operation; createdAt also
  // excludes rows newer than the boundary from a later transaction retry.
  const readAt = now();

  for (let attempt = 0; attempt < maxMarkAllTransactionAttempts; attempt += 1) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          // This authoritative membership query is the first transaction query,
          // establishing the repeatable-read snapshot before any notification is
          // marked. Membership changes in another transaction cannot change the
          // group audience between the read and receipt writes.
          const memberships = await loadNotificationAudience(transaction, userId);
          await transaction.notification.updateMany({
            where: { userId, isRead: false, createdAt: { lte: readAt } },
            data: { isRead: true, readAt },
          });

          // Option A: one receipt per unread group row visible in the same
          // snapshot and at or before the read cutoff. Keyset pagination keeps
          // both the materialized ID set and each INSERT bounded, without using
          // OFFSET (the cursor is stable while this transaction writes receipts).
          const groupWhere = unreadGroupNotificationWhere(userId, memberships);
          if (groupWhere !== null) {
            let lastNotificationId: string | null = null;
            while (true) {
              const unread = (await transaction.notification.findMany({
                where: {
                  AND: [
                    groupWhere,
                    { createdAt: { lte: readAt } },
                    ...(lastNotificationId === null
                      ? []
                      : [{ id: { gt: lastNotificationId } }]),
                  ],
                },
                orderBy: { id: 'asc' },
                take: notificationMarkAllLimits.groupReceiptBatchSize,
                select: { id: true },
              })) as readonly { readonly id: string }[];
              if (unread.length === 0) break;

              await transaction.notificationReceipt.createMany({
                data: unread.map((row) => ({ notificationId: row.id, userId, readAt })),
                skipDuplicates: true,
              });

              if (unread.length < notificationMarkAllLimits.groupReceiptBatchSize) break;
              lastNotificationId = unread[unread.length - 1]?.id ?? null;
              if (lastNotificationId === null) break;
            }
          }
        },
        { isolationLevel: 'RepeatableRead' },
      );
      break;
    } catch (error) {
      if (!isSerializationConflict(error) || attempt + 1 >= maxMarkAllTransactionAttempts) {
        throw error;
      }
    }
  }

  // Count after commit, outside the repeatable-read snapshot. New notifications
  // committed during the read-all operation remain unread and are reflected in
  // both the HTTP response and the realtime badge event.
  const unreadCount = await countUnreadNotifications(prisma, userId);
  return { unreadCount };
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2034'
  );
}
