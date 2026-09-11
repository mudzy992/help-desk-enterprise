import type { TicketParticipantRecord } from './collaboration.types';
import { matchesNullableField, pickInMemoryRecord } from './in-memory-record';

type ParticipantWhere = {
  readonly id?: string;
  readonly ticketId?: string;
  readonly role?: string;
  readonly userId?: string | null;
  readonly groupId?: string | null;
};

export function createInMemoryTicketParticipantDelegate(
  records: Map<string, TicketParticipantRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: ParticipantWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined && record.id !== where.id) {
        return false;
      }
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      if (where?.role !== undefined && record.role !== where.role) {
        return false;
      }
      return (
        matchesNullableField(record.userId, where?.userId) &&
        matchesNullableField(record.groupId, where?.groupId)
      );
    });
  return {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: ParticipantWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      if (orderBy?.createdAt === 'desc') {
        return items.reverse();
      }
      return items;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: ParticipantWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create: async ({
      data,
    }: {
      data: Omit<TicketParticipantRecord, 'id' | 'createdAt'> & { id?: string };
    }) => {
      const created: TicketParticipantRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      records.delete(where.id);
      return current;
    },
  };
}
