import type { NotificationRecord } from './notifications.types';

type NotificationWhere = {
  readonly id?: string;
  readonly userId?: string;
  readonly isRead?: boolean;
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
    }: {
      where?: NotificationWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    } = {}) => {
      const items = sortNotifications(matching(where), orderBy);
      return take === undefined ? items : items.slice(0, take);
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
  if (where.id !== undefined && record.id !== where.id) {
    return false;
  }
  if (where.userId !== undefined && record.userId !== where.userId) {
    return false;
  }
  return where.isRead === undefined || record.isRead === where.isRead;
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
