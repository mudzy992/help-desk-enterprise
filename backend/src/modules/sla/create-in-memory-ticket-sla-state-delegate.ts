import type { TicketSlaStateRecord } from './ticket-sla.types';

type TicketSlaStateWhere = {
  readonly resolutionCompletedAt?: null;
  readonly ticketId?: string | { readonly in: readonly string[] };
};

export function createInMemoryTicketSlaStateDelegate(
  states: Map<string, TicketSlaStateRecord>,
  nextId: (prefix: string) => string,
  now: () => Date,
) {
  const find = (where: { id?: string; ticketId?: string }) => {
    if (where.id !== undefined) {
      return states.get(where.id) ?? null;
    }
    if (where.ticketId !== undefined) {
      return (
        [...states.values()].find((row) => row.ticketId === where.ticketId) ??
        null
      );
    }
    return null;
  };
  return {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; ticketId?: string };
    }) => find(where),
    findMany: async ({
      where,
    }: {
      where?: TicketSlaStateWhere;
    } = {}) =>
      [...states.values()].filter((row) =>
        matchesTicketSlaStateWhere(row, where),
      ),
    create: async ({
      data,
    }: {
      data: Omit<TicketSlaStateRecord, 'id' | 'updatedAt'> & { id?: string };
    }) => {
      const created: TicketSlaStateRecord = {
        ...data,
        firedEscalationKeys: [...(data.firedEscalationKeys ?? [])],
        id: data.id ?? nextId('sla'),
        updatedAt: now(),
      };
      states.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id?: string; ticketId?: string };
      data: Partial<TicketSlaStateRecord>;
    }) => {
      const current = find(where);
      if (current === null) {
        throw new Error('NOT_FOUND');
      }
      const updated: TicketSlaStateRecord = {
        ...current,
        ...data,
        id: current.id,
        ticketId: current.ticketId,
        updatedAt: now(),
      };
      states.set(updated.id, updated);
      return updated;
    },
  };
}

function matchesTicketSlaStateWhere(
  row: TicketSlaStateRecord,
  where?: TicketSlaStateWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (
    where.resolutionCompletedAt === null &&
    row.resolutionCompletedAt !== null
  ) {
    return false;
  }
  if (where.ticketId === undefined) {
    return true;
  }
  if (typeof where.ticketId === 'string') {
    return row.ticketId === where.ticketId;
  }
  return where.ticketId.in.includes(row.ticketId);
}
