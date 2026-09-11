import type { TicketMessageRecord } from './collaboration.types';
import { pickInMemoryRecord } from './in-memory-record';

type MessageWhere = {
  readonly ticketId?: string;
  readonly type?: string;
};

export function createInMemoryTicketMessageDelegate(
  records: Map<string, TicketMessageRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: MessageWhere) =>
    [...records.values()].filter((record) => {
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      return where?.type === undefined || record.type === where.type;
    });
  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: MessageWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      return orderBy?.createdAt === 'desc' ? items.reverse() : items;
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
