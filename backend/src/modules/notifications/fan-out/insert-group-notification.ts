import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationType } from '../notifications.constants';
import type { NotificationPayload, NotificationRecord } from '../notifications.types';

/**
 * Option A: ONE row for the whole group. `(groupId, dedupeKey)` is unique, so a
 * re-ingest of the same event is a no-op (`skipDuplicates` → count 0 → `null`, and
 * nothing is published twice).
 */
export async function insertGroupNotification(
  prisma: PrismaService,
  input: {
    readonly groupId: string;
    readonly excludedUserIds: readonly string[];
    readonly type: NotificationType;
    readonly title: string;
    readonly body: string | null;
    readonly ticketId: string | null;
    readonly payload: NotificationPayload;
    readonly dedupeKey: string;
    readonly nextId?: () => string;
    readonly now?: Date;
  },
): Promise<NotificationRecord | null> {
  const record: NotificationRecord = {
    id: (input.nextId ?? (() => randomUUID()))(),
    userId: null,
    groupId: input.groupId,
    excludedUserIds: [...new Set(input.excludedUserIds)],
    type: input.type,
    title: input.title,
    body: input.body,
    isRead: false,
    readAt: null,
    ticketId: input.ticketId,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    createdAt: input.now ?? new Date(),
  };
  const data: Prisma.NotificationCreateManyInput = {
    ...record,
    excludedUserIds: [...(record.excludedUserIds ?? [])],
    payload: record.payload as Prisma.InputJsonValue,
  };
  const result = await prisma.notification.createMany({
    data: [data],
    skipDuplicates: true,
  });
  return result.count > 0 ? record : null;
}
