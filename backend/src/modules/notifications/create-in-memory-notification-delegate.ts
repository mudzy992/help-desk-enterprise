import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type { NotificationRecord } from './notifications.types';

type NotificationWhere = {
  readonly id?: string | { readonly in: readonly string[] };
  readonly userId?: string | { readonly in: readonly string[] };
  readonly dedupeKey?: string;
  readonly isRead?: boolean;
  /** Phase 2.3: the retention job deletes by age. */
  readonly createdAt?: { readonly lt: Date };
};

type NotificationCreateData = Omit<NotificationRecord, 'id' | 'createdAt' | 'isRead' | 'readAt'> & {
  readonly id?: string;
  readonly isRead?: boolean;
  readonly readAt?: Date | null;
};

export function createInMemoryNotificationDelegate(
  records: Map<string, NotificationRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: NotificationWhere) =>
    [...records.values()].filter((record) => matchesNotification(record, where));

  return {
    findMany: async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where?: NotificationWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
      select?: Record<string, boolean>;
    } = {}) => {
      const items = sortNotifications(matching(where), orderBy);
      const window = take === undefined ? items : items.slice(0, take);
      return select === undefined
        ? window
        : window.map((item) => pickInMemoryFields(item, select));
    },
    findFirst: async ({ where }: { where?: NotificationWhere } = {}) =>
      matching(where)[0] ?? null,
    count: async ({ where }: { where?: NotificationWhere } = {}) =>
      matching(where).length,
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
        const duplicate = [...records.values()].some(
          (record) =>
            record.userId === item.userId && record.dedupeKey === item.dedupeKey,
        );
        if (duplicate) {
          if (skipDuplicates !== true) {
            throw { code: 'P2002', meta: { target: ['userId', 'dedupeKey'] } };
          }
          continue;
        }
        const created: NotificationRecord = {
          id: item.id ?? nextId(),
          userId: item.userId,
          type: item.type,
          title: item.title,
          body: item.body,
          isRead: item.isRead ?? false,
          readAt: item.readAt ?? null,
          ticketId: item.ticketId,
          payload: item.payload,
          dedupeKey: item.dedupeKey,
          createdAt: now(),
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
  where?: NotificationWhere,
): boolean {
  if (where === undefined) {
    return true;
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
    if (typeof where.userId === 'string') {
      if (record.userId !== where.userId) {
        return false;
      }
    } else if (!where.userId.in.includes(record.userId)) {
      return false;
    }
  }
  if (where.dedupeKey !== undefined && record.dedupeKey !== where.dedupeKey) {
    return false;
  }
  if (where.isRead !== undefined && record.isRead !== where.isRead) {
    return false;
  }
  if (
    where.createdAt !== undefined &&
    record.createdAt.getTime() >= where.createdAt.lt.getTime()
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
