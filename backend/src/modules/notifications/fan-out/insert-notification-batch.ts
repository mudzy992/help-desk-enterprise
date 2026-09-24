import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationType } from '../notifications.constants';
import type { NotificationPayload, NotificationRecord } from '../notifications.types';

/**
 * Phase 2.3 (plan §2.3): one batch insert for the whole recipient list.
 *
 * Before: `recipientIds.map(persistInAppNotification)` ran one `INSERT` per
 * member — a message in a 200-agent group meant 200 statements, and at ten
 * events per second that is the 2 000 writes/s the plan calls out.
 *
 * Now: one `SELECT` of the recipients that already have the event (the unique
 * `(userId, dedupeKey)` is still what makes a re-ingest a no-op) followed by one
 * `createMany`. `createMany` cannot return rows, so the ids and the timestamp
 * are generated here — the returned records are exactly the rows that were
 * inserted, which is what the publish step has to emit.
 *
 * Two statements per event, independent of how many people are behind it.
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
  const records: readonly NotificationRecord[] = pending.map((userId) => ({
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
  const data: Prisma.NotificationCreateManyInput[] = records.map((record) => ({
    ...record,
    payload: record.payload as Prisma.InputJsonValue,
  }));
  await prisma.notification.createMany({
    data,
    // Two events of the same kind for the same ticket can race; the loser skips
    // its rows instead of failing the whole batch (same rule the single insert
    // had, `P2002` → skip).
    skipDuplicates: true,
  });
  return records;
}
