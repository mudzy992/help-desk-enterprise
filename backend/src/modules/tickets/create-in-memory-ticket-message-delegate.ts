import type { TicketMessageRecord } from './collaboration.types';
import { pickInMemoryRecord } from './in-memory-record';

type MessageWhere = {
  readonly id?: string | { in: readonly string[] };
  readonly ticketId?: string;
  readonly type?: string | { notIn: readonly string[] };
  readonly createdAt?: { lt: Date };
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
      if (where?.createdAt !== undefined && !(record.createdAt < where.createdAt.lt)) {
        return false;
      }
      if (where?.type === undefined) {
        return true;
      }
      return typeof where.type === 'string'
        ? record.type === where.type
        : !where.type.notIn.includes(record.type);
    });
  return {
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
    create: async ({
      data,
    }: {
      data: Omit<TicketMessageRecord, 'id' | 'createdAt'> & { id?: string };
    }) => {
      const created: TicketMessageRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
  };
}
