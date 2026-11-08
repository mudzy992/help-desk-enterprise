import type { TicketMessageRecord } from './collaboration.types';
import { pickInMemoryRecord } from './in-memory-record';

type MessageWhere = {
  readonly id?: string | { in: readonly string[] };
  readonly ticketId?: string;
  readonly idempotencyKey?: string | null;
  readonly type?: string | { notIn: readonly string[] };
  readonly body?: string;
  readonly createdAt?: { lt: Date };
};

type MessageCreateData = Omit<TicketMessageRecord, 'id' | 'createdAt'> & {
  readonly id?: string;
};

export function createInMemoryTicketMessageDelegate(
  records: Map<string, TicketMessageRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: MessageWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined) {
        if (typeof where.id === 'string' && record.id !== where.id) {
          return false;
        }
        if (typeof where.id !== 'string' && !where.id.in.includes(record.id)) {
          return false;
        }
      }
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      if (
        where?.idempotencyKey !== undefined &&
        record.idempotencyKey !== where.idempotencyKey
      ) {
        return false;
      }
      if (where?.createdAt !== undefined && !(record.createdAt < where.createdAt.lt)) {
        return false;
      }
      if (where?.body !== undefined && record.body !== where.body) {
        return false;
      }
      if (where?.type === undefined) {
        return true;
      }
      return typeof where.type === 'string'
        ? record.type === where.type
        : !where.type.notIn.includes(record.type);
    });

  const create = async ({ data }: { data: MessageCreateData }) => {
    const created: TicketMessageRecord = {
      ...data,
      id: data.id ?? nextId(),
      createdAt: now(),
    };
    records.set(created.id, created);
    return created;
  };

  const upsert = async ({
    where,
    create: createInput,
    update,
  }: {
    where: {
      readonly ticketId_idempotencyKey: {
        readonly ticketId: string;
        readonly idempotencyKey: string;
      };
    };
    create: { readonly data: MessageCreateData };
    update: Partial<Omit<TicketMessageRecord, 'id' | 'createdAt'>>;
  }) => {
    const { ticketId, idempotencyKey } = where.ticketId_idempotencyKey;
    const existing = [...records.values()].find(
      (record) =>
        record.ticketId === ticketId && record.idempotencyKey === idempotencyKey,
    );
    if (existing === undefined) {
      return create(createInput);
    }
    if (Object.keys(update).length === 0) {
      return existing;
    }
    const updated: TicketMessageRecord = { ...existing, ...update };
    records.set(updated.id, updated);
    return updated;
  };

  return {
    count: async ({ where }: { where?: MessageWhere } = {}) =>
      matching(where).length,
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: MessageWhere;
      orderBy?:
        | { createdAt: 'asc' | 'desc' }
        | readonly { createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[];
      take?: number;
    } = {}) => {
      const items = matching(where);
      const primary = Array.isArray(orderBy) ? orderBy[0] : orderBy;
      const ordered = primary?.createdAt === 'desc' ? items.reverse() : items;
      return take === undefined ? ordered : ordered.slice(0, take);
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: MessageWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create,
    upsert,
  };
}
