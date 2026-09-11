import type { TicketTimeLogRecord } from './collaboration.types';
import { matchesNullableField, pickInMemoryRecord } from './in-memory-record';

type TimeLogWhere = {
  readonly id?: string;
  readonly ticketId?: string;
  readonly userId?: string;
  readonly endedAt?: Date | null;
};

export function createInMemoryTicketTimeLogDelegate(
  records: Map<string, TicketTimeLogRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: TimeLogWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined && record.id !== where.id) {
        return false;
      }
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      if (where?.userId !== undefined && record.userId !== where.userId) {
        return false;
      }
      return matchesNullableField(record.endedAt, where?.endedAt);
    });
  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: TimeLogWhere;
      orderBy?: { startedAt: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      return orderBy?.startedAt === 'desc' ? items.reverse() : items;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: TimeLogWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create: async ({
      data,
    }: {
      data: Omit<TicketTimeLogRecord, 'id' | 'createdAt'> & { id?: string };
    }) => {
      const created: TicketTimeLogRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<TicketTimeLogRecord>;
    }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: TicketTimeLogRecord = { ...current, ...data };
      records.set(updated.id, updated);
      return updated;
    },
  };
}
