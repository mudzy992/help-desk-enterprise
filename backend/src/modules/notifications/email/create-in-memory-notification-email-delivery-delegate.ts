export type NotificationEmailDeliveryRecord = {
  readonly id: string;
  readonly userId: string;
  readonly dedupeKey: string;
  readonly toAddress: string;
  readonly templateKey: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type DeliveryWhere = {
  readonly userId?: string;
  readonly dedupeKey?: string;
  readonly status?: string;
};

export function createInMemoryNotificationEmailDeliveryDelegate(
  records: Map<string, NotificationEmailDeliveryRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: DeliveryWhere) =>
    [...records.values()].filter((record) => matchesDelivery(record, where));

  return {
    create: async ({
      data,
    }: {
      data: Omit<NotificationEmailDeliveryRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        readonly id?: string;
      };
    }) => {
      const duplicate = [...records.values()].some(
        (record) =>
          record.userId === data.userId && record.dedupeKey === data.dedupeKey,
      );
      if (duplicate) {
        throw { code: 'P2002', meta: { target: ['userId', 'dedupeKey'] } };
      }
      const created: NotificationEmailDeliveryRecord = {
        id: data.id ?? nextId(),
        userId: data.userId,
        dedupeKey: data.dedupeKey,
        toAddress: data.toAddress,
        templateKey: data.templateKey,
        status: data.status,
        createdAt: now(),
        updatedAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: DeliveryWhere;
      data: { status?: string };
    }) => {
      const matched = matching(where);
      for (const record of matched) {
        records.set(record.id, {
          ...record,
          status: data.status ?? record.status,
          updatedAt: now(),
        });
      }
      return { count: matched.length };
    },
    deleteMany: async ({ where }: { where?: DeliveryWhere } = {}) => {
      const matched = matching(where);
      for (const record of matched) {
        records.delete(record.id);
      }
      return { count: matched.length };
    },
    findMany: async ({ where }: { where?: DeliveryWhere } = {}) =>
      matching(where),
  };
}

function matchesDelivery(
  record: NotificationEmailDeliveryRecord,
  where?: DeliveryWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.userId !== undefined && record.userId !== where.userId) {
    return false;
  }
  if (where.dedupeKey !== undefined && record.dedupeKey !== where.dedupeKey) {
    return false;
  }
  return where.status === undefined || record.status === where.status;
}
