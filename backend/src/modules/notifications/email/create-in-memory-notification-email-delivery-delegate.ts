export type NotificationEmailDeliveryRecord = {
  readonly id: string;
  readonly userId: string;
  readonly dedupeKey: string;
  readonly toAddress: string;
  readonly templateKey: string;
  readonly status: string;
  readonly attempts: number;
  readonly lastAttemptAt: Date | null;
  readonly nextRetryAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorResponseCode: number | null;
  readonly providerMessageId: string | null;
  readonly providerResponseCode: number | null;
  readonly providerAcceptedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type DeliveryWhere = {
  readonly userId?: string;
  readonly dedupeKey?: string;
  readonly status?: string | { readonly in: readonly string[] };
  readonly updatedAt?: { readonly lt: Date };
  readonly nextRetryAt?: null | { readonly lte: Date };
  readonly OR?: readonly DeliveryWhere[];
};

type DeliveryCreateData = Pick<
  NotificationEmailDeliveryRecord,
  'userId' | 'dedupeKey' | 'toAddress' | 'templateKey' | 'status'
> &
  Partial<
    Pick<
      NotificationEmailDeliveryRecord,
      | 'id'
      | 'attempts'
      | 'lastAttemptAt'
      | 'nextRetryAt'
      | 'lastErrorCode'
      | 'lastErrorResponseCode'
      | 'providerMessageId'
      | 'providerResponseCode'
      | 'providerAcceptedAt'
      | 'createdAt'
      | 'updatedAt'
    >
  >;

type DeliveryUpdateData = Partial<
  Omit<NotificationEmailDeliveryRecord, 'id' | 'userId' | 'dedupeKey' | 'createdAt'>
> & {
  readonly attempts?: number | { readonly increment: number };
};

export function createInMemoryNotificationEmailDeliveryDelegate(
  records: Map<string, NotificationEmailDeliveryRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: DeliveryWhere) =>
    [...records.values()].filter((record) => matchesDelivery(record, where));

  return {
    create: async ({ data }: { data: DeliveryCreateData }) => {
      const duplicate = [...records.values()].some(
        (record) => record.userId === data.userId && record.dedupeKey === data.dedupeKey,
      );
      if (duplicate) {
        throw { code: 'P2002', meta: { target: ['userId', 'dedupeKey'] } };
      }
      const createdAt = data.createdAt ?? now();
      const created: NotificationEmailDeliveryRecord = {
        id: data.id ?? nextId(),
        userId: data.userId,
        dedupeKey: data.dedupeKey,
        toAddress: data.toAddress,
        templateKey: data.templateKey,
        status: data.status,
        attempts: data.attempts ?? 0,
        lastAttemptAt: data.lastAttemptAt ?? null,
        nextRetryAt: data.nextRetryAt ?? null,
        lastErrorCode: data.lastErrorCode ?? null,
        lastErrorResponseCode: data.lastErrorResponseCode ?? null,
        providerMessageId: data.providerMessageId ?? null,
        providerResponseCode: data.providerResponseCode ?? null,
        providerAcceptedAt: data.providerAcceptedAt ?? null,
        createdAt,
        updatedAt: data.updatedAt ?? now(),
      };
      records.set(created.id, created);
      return created;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: DeliveryWhere;
      data: DeliveryUpdateData;
    }) => {
      const matched = matching(where);
      for (const record of matched) {
        records.set(record.id, applyDeliveryUpdate(record, data, now()));
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
    count: async ({ where }: { where?: DeliveryWhere } = {}) => matching(where).length,
    findMany: async ({ where }: { where?: DeliveryWhere } = {}) => matching(where),
    findUnique: async ({
      where,
    }: {
      where: { readonly userId_dedupeKey?: { readonly userId: string; readonly dedupeKey: string }; readonly id?: string };
    }) => {
      if (where.userId_dedupeKey !== undefined) {
        return (
          [...records.values()].find(
            (record) =>
              record.userId === where.userId_dedupeKey?.userId &&
              record.dedupeKey === where.userId_dedupeKey?.dedupeKey,
          ) ?? null
        );
      }
      return [...records.values()].find((record) => record.id === where.id) ?? null;
    },
  };
}

function matchesDelivery(
  record: NotificationEmailDeliveryRecord,
  where?: DeliveryWhere,
): boolean {
  if (where === undefined) return true;
  if (where.userId !== undefined && record.userId !== where.userId) return false;
  if (where.dedupeKey !== undefined && record.dedupeKey !== where.dedupeKey) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && record.status !== where.status) return false;
    if (typeof where.status !== 'string' && !where.status.in.includes(record.status)) return false;
  }
  if (where.updatedAt !== undefined && record.updatedAt >= where.updatedAt.lt) return false;
  if (where.nextRetryAt === null && record.nextRetryAt !== null) return false;
  if (
    where.nextRetryAt !== undefined &&
    where.nextRetryAt !== null &&
    (record.nextRetryAt === null || record.nextRetryAt > where.nextRetryAt.lte)
  ) {
    return false;
  }
  return where.OR === undefined || where.OR.some((part) => matchesDelivery(record, part));
}

function applyDeliveryUpdate(
  record: NotificationEmailDeliveryRecord,
  data: DeliveryUpdateData,
  now: Date,
): NotificationEmailDeliveryRecord {
  const attempts =
    typeof data.attempts === 'object' && data.attempts !== null
      ? record.attempts + data.attempts.increment
      : data.attempts ?? record.attempts;
  return {
    ...record,
    ...(data.status === undefined ? {} : { status: data.status }),
    attempts,
    ...(data.lastAttemptAt === undefined ? {} : { lastAttemptAt: data.lastAttemptAt }),
    ...(data.nextRetryAt === undefined ? {} : { nextRetryAt: data.nextRetryAt }),
    ...(Object.hasOwn(data, 'lastErrorCode') ? { lastErrorCode: data.lastErrorCode ?? null } : {}),
    ...(Object.hasOwn(data, 'lastErrorResponseCode')
      ? { lastErrorResponseCode: data.lastErrorResponseCode ?? null }
      : {}),
    ...(Object.hasOwn(data, 'providerMessageId')
      ? { providerMessageId: data.providerMessageId ?? null }
      : {}),
    ...(Object.hasOwn(data, 'providerResponseCode')
      ? { providerResponseCode: data.providerResponseCode ?? null }
      : {}),
    ...(Object.hasOwn(data, 'providerAcceptedAt')
      ? { providerAcceptedAt: data.providerAcceptedAt ?? null }
      : {}),
    updatedAt: data.updatedAt ?? now,
  };
}
