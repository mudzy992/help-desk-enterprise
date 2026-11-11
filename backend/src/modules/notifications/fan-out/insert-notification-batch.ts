import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { emitNotificationsCreated } from './notification-created-sinks';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationType } from '../notifications.constants';
import type { NotificationPayload, NotificationRecord } from '../notifications.types';

/**
 * Persist a personal notification batch and return only the rows won by this
 * INSERT. The pre-read avoids a write on ordinary replays, but cannot arbitrate
 * concurrent workers: both can observe no row before either writes. PostgreSQL's
 * `createManyAndReturn` with `skipDuplicates` returns only rows actually inserted
 * by this statement, so a concurrent loser has nothing to emit.
 */
export async function insertNotificationBatch(
  prisma: PrismaService,
  input: {
    readonly userIds: readonly string[];
    readonly type: NotificationType;
    readonly title: string;
    readonly body: string | null;
    readonly ticketId: string | null;
    readonly payload: NotificationPayload;
    readonly dedupeKey: string;
    /** Test seam: makes the generated ids predictable. */
    readonly nextId?: () => string;
    /** Test seam: one timestamp for the whole batch. */
    readonly now?: Date;
  },
): Promise<readonly NotificationRecord[]> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) {
    return [];
  }

  const alreadyNotified = (await prisma.notification.findMany({
    where: { dedupeKey: input.dedupeKey, userId: { in: userIds } },
    select: { userId: true },
  })) as readonly { readonly userId: string }[];
  const notified = new Set(alreadyNotified.map((row) => row.userId));
  const pending = userIds.filter((userId) => !notified.has(userId));
  if (pending.length === 0) {
    return [];
  }

  const createdAt = input.now ?? new Date();
  const nextId = input.nextId ?? (() => randomUUID());
  const candidates: readonly NotificationRecord[] = pending.map((userId) => ({
    id: nextId(),
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    isRead: false,
    readAt: null,
    ticketId: input.ticketId,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    createdAt,
  }));
  const data: Prisma.NotificationCreateManyInput[] = candidates.map(
    ({ excludedUserIds: _excluded, groupId: _group, ...record }) => ({
      ...record,
      payload: record.payload as Prisma.InputJsonValue,
    }),
  );

  const inserted = (await prisma.notification.createManyAndReturn({
    data,
    skipDuplicates: true,
  })) as readonly NotificationRecord[];
  emitNotificationsCreated(inserted);
  return inserted;
}
