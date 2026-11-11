import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type { NotificationRecord } from './notifications.types';

export type NotificationWhere = {
  readonly id?: string | { readonly in: readonly string[] };
  readonly userId?: string | null | { readonly in: readonly string[] };
  /** Option A: group rows, their audience and the caller's receipts. */
  readonly groupId?: string | null;
  readonly OR?: readonly NotificationWhere[];
  readonly NOT?: { readonly excludedUserIds?: { readonly has: string } };
  readonly receipts?: { readonly none: { readonly userId: string } };
  readonly dedupeKey?: string;
  readonly isRead?: boolean;
  /** Phase 2.3: the retention job deletes by age. */
  readonly createdAt?: { readonly lt?: Date; readonly gte?: Date };
};

/** Option A: `(notificationId, userId)` read marks of group notifications. */
export type InMemoryNotificationReceipt = {
  readonly notificationId: string;
  readonly userId: string;
  readonly readAt: Date;
};

export function createInMemoryNotificationReceiptDelegate(
  receipts: Map<string, InMemoryNotificationReceipt>,
) {
  return {
    createMany: async ({
      data,
    }: {
      data: readonly { notificationId: string; userId: string; readAt?: Date }[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const item of data) {
        const key = `${item.notificationId}\u0000${item.userId}`;
        if (receipts.has(key)) {
          continue;
        }
        receipts.set(key, {
          notificationId: item.notificationId,
          userId: item.userId,
          readAt: item.readAt ?? new Date(),
        });
        count += 1;
      }
      return { count };
    },
    findMany: async ({
      where,
    }: { where?: { userId?: string; notificationId?: string } } = {}) =>
      [...receipts.values()].filter(
        (receipt) =>
          (where?.userId === undefined || receipt.userId === where.userId) &&
          (where?.notificationId === undefined ||
            receipt.notificationId === where.notificationId),
      ),
  };
}

type NotificationCreateData = Omit<NotificationRecord, 'id' | 'createdAt' | 'isRead' | 'readAt'> & {
  readonly id?: string;
  readonly createdAt?: Date;
  readonly isRead?: boolean;
  readonly readAt?: Date | null;
};

export function createInMemoryNotificationDelegate(
  records: Map<string, NotificationRecord>,
  nextId: () => string,
  now: () => Date,
  receipts: Map<string, InMemoryNotificationReceipt> = new Map(),
) {
  const matching = (where?: NotificationWhere) =>
    [...records.values()].filter((record) =>
      matchesNotification(record, where, receipts),
    );
  const withReceipts = (
    items: readonly NotificationRecord[],
    include?: { receipts?: { where?: { userId?: string } } },
  ) =>
    include?.receipts === undefined
      ? items
      : items.map((item) => ({
          ...item,
          receipts: [...receipts.values()].filter(
            (receipt) =>
              receipt.notificationId === item.id &&
              (include.receipts?.where?.userId === undefined ||
                receipt.userId === include.receipts.where.userId),
          ),
        }));

  return {
    findMany: async ({
      where,
      orderBy,
      take,
      select,
      include,
    }: {
      where?: NotificationWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
      select?: Record<string, boolean>;
      include?: { receipts?: { where?: { userId?: string } } };
    } = {}) => {
      const items = sortNotifications(matching(where), orderBy);
      const window = take === undefined ? items : items.slice(0, take);
      return select === undefined
        ? withReceipts(window, include)
        : window.map((item) => pickInMemoryFields(item, select));
    },
    findFirst: async ({ where }: { where?: NotificationWhere } = {}) =>
      matching(where)[0] ?? null,
    count: async ({
      where,
      take,
    }: { where?: NotificationWhere; take?: number } = {}) => {
      const matched = matching(where).length;
      return take === undefined ? matched : Math.min(matched, take);
    },
    create: async ({ data }: { data: NotificationCreateData }) => {
      const duplicate = [...records.values()].some(
        (record) =>
          record.userId === data.userId && record.dedupeKey === data.dedupeKey,
      );
      if (duplicate) {
        throw { code: 'P2002', meta: { target: ['userId', 'dedupeKey'] } };
      }
      const created: NotificationRecord = {
        id: data.id ?? nextId(),
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        isRead: data.isRead ?? false,
        readAt: data.readAt ?? null,
        ticketId: data.ticketId,
        payload: data.payload,
        dedupeKey: data.dedupeKey,
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    /**
     * Phase 2.3 (plan §2.3): the fan-out writes a whole recipient list with one
     * statement. Duplicates are skipped when asked to (the unique constraint is
     * `(userId, dedupeKey)`), like `skipDuplicates` on the real client.
     */
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data?: readonly NotificationCreateData[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const item of data ?? []) {
        const duplicate = [...records.values()].some((record) =>
          item.userId === null || item.userId === undefined
            ? (record.groupId ?? null) === (item.groupId ?? null) &&
              record.userId === null &&
              record.dedupeKey === item.dedupeKey
            : record.userId === item.userId && record.dedupeKey === item.dedupeKey,
        );
        if (duplicate) {
          if (skipDuplicates !== true) {
            throw { code: 'P2002', meta: { target: ['userId', 'dedupeKey'] } };
          }
          continue;
        }
        const created: NotificationRecord = {
          id: item.id ?? nextId(),
          userId: item.userId ?? null,
          groupId: item.groupId ?? null,
          excludedUserIds: [...(item.excludedUserIds ?? [])],
          type: item.type,
          title: item.title,
          body: item.body,
          isRead: item.isRead ?? false,
          readAt: item.readAt ?? null,
          ticketId: item.ticketId,
          payload: item.payload,
          dedupeKey: item.dedupeKey,
          createdAt: item.createdAt ?? now(),
        };
        records.set(created.id, created);
        count += 1;
      }
      return { count };
    },
    groupBy: async ({
      by,
      where,
    }: {
      by: readonly string[];
      where?: NotificationWhere;
      _count?: unknown;
    }) => {
      const groups = new Map<string, Record<string, unknown>>();
      for (const record of matching(where)) {
        const row = record as unknown as Record<string, unknown>;
        const key = by.map((field) => String(row[field])).join('\u0000');
        const group = groups.get(key) ?? {
          ...Object.fromEntries(by.map((field) => [field, row[field]])),
          _count: { _all: 0 },
        };
        (group._count as { _all: number })._all += 1;
        groups.set(key, group);
      }
      return [...groups.values()];
    },
    /** Phase 2.3 (plan §2.3): retention deletes in bounded batches. */
    deleteMany: async ({ where }: { where?: NotificationWhere } = {}) => {
      const matched = matching(where);
      for (const record of matched) {
        records.delete(record.id);
      }
      return { count: matched.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: NotificationWhere;
      data: { isRead?: boolean; readAt?: Date | null };
    }) => {
      const matched = matching(where);
      for (const record of matched) {
        records.set(record.id, {
          ...record,
          isRead: data.isRead ?? record.isRead,
          readAt: data.readAt === undefined ? record.readAt : data.readAt,
        });
      }
      return { count: matched.length };
    },
  };
}

function matchesNotification(
  record: NotificationRecord,
  where: NotificationWhere | undefined,
  receipts: Map<string, InMemoryNotificationReceipt>,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (
    where.OR !== undefined &&
    !where.OR.some((branch) => matchesNotification(record, branch, receipts))
  ) {
    return false;
  }
  if (where.id !== undefined) {
    if (typeof where.id === 'string') {
      if (record.id !== where.id) {
        return false;
      }
    } else if (!where.id.in.includes(record.id)) {
      return false;
    }
  }
  if (where.userId !== undefined) {
    if (where.userId === null || typeof where.userId === 'string') {
      if (record.userId !== where.userId) {
        return false;
      }
    } else if (record.userId === null || !where.userId.in.includes(record.userId)) {
      return false;
    }
  }
  if (where.groupId !== undefined && (record.groupId ?? null) !== where.groupId) {
    return false;
  }
  if (
    where.NOT?.excludedUserIds !== undefined &&
    (record.excludedUserIds ?? []).includes(where.NOT.excludedUserIds.has)
  ) {
    return false;
  }
  if (
    where.receipts !== undefined &&
    receipts.has(`${record.id}\u0000${where.receipts.none.userId}`)
  ) {
    return false;
  }
  if (where.dedupeKey !== undefined && record.dedupeKey !== where.dedupeKey) {
    return false;
  }
  if (where.isRead !== undefined && record.isRead !== where.isRead) {
    return false;
  }
  if (
    where.createdAt?.lt !== undefined &&
    record.createdAt.getTime() >= where.createdAt.lt.getTime()
  ) {
    return false;
  }
  if (
    where.createdAt?.gte !== undefined &&
    record.createdAt.getTime() < where.createdAt.gte.getTime()
  ) {
    return false;
  }
  return true;
}

function sortNotifications(
  items: NotificationRecord[],
  orderBy?: { createdAt: 'asc' | 'desc' },
): NotificationRecord[] {
  return [...items].sort((left, right) => {
    const delta = left.createdAt.getTime() - right.createdAt.getTime();
    if (delta !== 0) {
      return orderBy?.createdAt === 'asc' ? delta : -delta;
    }
    return right.id.localeCompare(left.id);
  });
}
