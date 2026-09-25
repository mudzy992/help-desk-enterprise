import type { TicketTimeLogRecord } from './collaboration.types';
import { pickInMemoryRecord } from './in-memory-record';

type Where = Readonly<Record<string, unknown>>;

/** Enough of Prisma's filter language for the time tracking queries (1.3). */
function matchesValue(actual: unknown, condition: unknown): boolean {
  if (condition === undefined) {
    return true;
  }
  if (condition === null) {
    return actual === null || actual === undefined;
  }
  if (condition instanceof Date) {
    return actual instanceof Date && actual.getTime() === condition.getTime();
  }
  if (typeof condition === 'object') {
    const ops = condition as Record<string, unknown>;
    const value = actual instanceof Date ? actual.getTime() : actual;
    const num = (input: unknown) => (input instanceof Date ? input.getTime() : input) as number;
    if ('in' in ops && !(ops.in as unknown[]).includes(actual)) return false;
    if ('not' in ops && actual === ops.not) return false;
    if ('lt' in ops && !(value !== null && value !== undefined && (value as number) < num(ops.lt))) return false;
    if ('lte' in ops && !(value !== null && value !== undefined && (value as number) <= num(ops.lte))) return false;
    if ('gt' in ops && !(value !== null && value !== undefined && (value as number) > num(ops.gt))) return false;
    if ('gte' in ops && !(value !== null && value !== undefined && (value as number) >= num(ops.gte))) return false;
    return true;
  }
  return actual === condition;
}

export function matchesTimeLogWhere(record: TicketTimeLogRecord, where?: Where): boolean {
  if (where === undefined) {
    return true;
  }
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Where[]).some((branch) => matchesTimeLogWhere(record, branch));
    }
    if (key === 'AND') {
      return (condition as Where[]).every((branch) => matchesTimeLogWhere(record, branch));
    }
    return matchesValue((record as unknown as Record<string, unknown>)[key] ?? null, condition);
  });
}

export function createInMemoryTicketTimeLogDelegate(
  records: Map<string, TicketTimeLogRecord>,
  nextId: () => string,
  now: () => Date,
  tickets?: ReadonlyMap<string, object>,
) {
  const matching = (where?: Where) =>
    [...records.values()].filter((record) => matchesTimeLogWhere(record, where));
  const sorted = (items: TicketTimeLogRecord[], orderBy?: { startedAt: 'asc' | 'desc' }) =>
    orderBy === undefined
      ? items
      : [...items].sort((left, right) =>
          orderBy.startedAt === 'desc'
            ? right.startedAt.getTime() - left.startedAt.getTime()
            : left.startedAt.getTime() - right.startedAt.getTime(),
        );
  return {
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: Where;
      orderBy?: { startedAt: 'asc' | 'desc' };
      take?: number;
    } = {}) => {
      const items = sorted(matching(where), orderBy);
      return take === undefined ? items : items.slice(0, take);
    },
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: Where;
      orderBy?: { startedAt: 'asc' | 'desc' };
      select?: Record<string, unknown>;
    } = {}) => {
      const record = sorted(matching(where), orderBy)[0];
      if (record === undefined || select === undefined) {
        return pickInMemoryRecord(record, select as Record<string, boolean> | undefined);
      }
      const scalar = Object.fromEntries(
        Object.entries(select).filter(([, value]) => value === true),
      ) as Record<string, boolean>;
      const picked = pickInMemoryRecord(record, scalar) as Record<string, unknown>;
      // Relation select used by loadActiveTimer: the whole ticket is enough for tests.
      if (typeof select.ticket === 'object' && select.ticket !== null) {
        picked.ticket = tickets?.get(record.ticketId) ?? null;
      }
      return picked;
    },
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
