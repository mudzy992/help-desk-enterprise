import type {
  BreakGlassEventRecord,
  TicketConfidentialGrantRecord,
} from './confidential/confidential.types';
import { matchesNullableField, pickInMemoryRecord } from './in-memory-record';

type GrantWhere = {
  readonly ticketId?: string;
  readonly userId?: string | null;
  readonly groupId?: string | null;
};

type BreakGlassWhere = {
  readonly ticketId?: string;
  readonly actorUserId?: string;
};

export function createInMemoryConfidentialGrantDelegate(
  records: Map<string, TicketConfidentialGrantRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: GrantWhere) =>
    [...records.values()].filter((record) => {
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      return (
        matchesNullableField(record.userId, where?.userId) &&
        matchesNullableField(record.groupId, where?.groupId)
      );
    });
  return {
    findMany: async ({ where }: { where?: GrantWhere } = {}) => matching(where),
    findFirst: async ({
      where,
      select,
    }: {
      where?: GrantWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create: async ({
      data,
    }: {
      data: Omit<TicketConfidentialGrantRecord, 'id' | 'createdAt'> & {
        id?: string;
      };
    }) => {
      const created: TicketConfidentialGrantRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
  };
}

export function createInMemoryBreakGlassEventDelegate(
  records: Map<string, BreakGlassEventRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: BreakGlassWhere) =>
    [...records.values()].filter((record) => {
      if (where?.ticketId !== undefined && record.ticketId !== where.ticketId) {
        return false;
      }
      return (
        where?.actorUserId === undefined ||
        record.actorUserId === where.actorUserId
      );
    });
  return {
    findMany: async ({ where }: { where?: BreakGlassWhere } = {}) =>
      matching(where),
    create: async ({
      data,
    }: {
      data: Omit<BreakGlassEventRecord, 'id' | 'createdAt'> & { id?: string };
    }) => {
      const created: BreakGlassEventRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
  };
}
