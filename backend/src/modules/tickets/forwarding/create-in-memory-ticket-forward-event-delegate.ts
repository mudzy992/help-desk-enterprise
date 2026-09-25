import { pickInMemoryRecord } from '../in-memory-record';
import type { TicketForwardEventRecord } from './forwarding.types';

type ForwardEventWhere = { readonly id?: string; readonly ticketId?: string };

/** Test double for `prisma.ticketForwardEvent` (package 1.1). */
export function createInMemoryTicketForwardEventDelegate(
  records: Map<string, TicketForwardEventRecord>,
  nextId: () => string,
  now: () => Date,
  requesterIdOf: (ticketId: string) => string | null,
) {
  let sequence = 0;
  const ordered = new Map<string, number>();
  const matching = (where?: ForwardEventWhere, direction: 'asc' | 'desc' = 'asc') =>
    [...records.values()]
      .filter(
        (record) =>
          (where?.id === undefined || record.id === where.id) &&
          (where?.ticketId === undefined || record.ticketId === where.ticketId),
      )
      .sort((left, right) => {
        const delta = (ordered.get(left.id) ?? 0) - (ordered.get(right.id) ?? 0);
        return direction === 'desc' ? -delta : delta;
      });
  const withTicket = (
    record: TicketForwardEventRecord | undefined,
    select?: Record<string, unknown>,
  ) => {
    if (record === undefined) {
      return null;
    }
    const { ticket, ...plain } = (select ?? {}) as Record<string, unknown> & {
      ticket?: unknown;
    };
    const picked = pickInMemoryRecord(
      record,
      select === undefined ? undefined : (plain as Record<string, boolean>),
    ) as Record<string, unknown> | null;
    if (picked === null || ticket === undefined) {
      return picked;
    }
    return { ...picked, ticket: { requesterId: requesterIdOf(record.ticketId) } };
  };
  return {
    create: async ({
      data,
    }: {
      data: Omit<TicketForwardEventRecord, 'id' | 'createdAt'>;
    }) => {
      const created: TicketForwardEventRecord = {
        ...data,
        id: nextId(),
        createdAt: now(),
      };
      records.set(created.id, created);
      ordered.set(created.id, sequence++);
      return created;
    },
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => withTicket(records.get(where.id), select),
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: ForwardEventWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: Record<string, unknown>;
    } = {}) => withTicket(matching(where, orderBy?.createdAt)[0], select),
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: ForwardEventWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    } = {}) => matching(where, orderBy?.createdAt).slice(0, take ?? undefined),
  };
}
