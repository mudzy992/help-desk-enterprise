import { matchesInMemoryTicket } from '../tickets/matches-in-memory-ticket';
import type {
  InMemoryTicketRelations,
  InMemoryTicketWhere,
} from '../tickets/in-memory-ticket-where';
import type { TicketRecord } from '../tickets/tickets.types';
import type { TicketSlaStateRecord } from './ticket-sla.types';

type TicketSlaStateWhere = {
  readonly resolutionCompletedAt?: null;
  readonly ticketId?: string | { readonly in: readonly string[] };
  /** Phase 2.1: the scanner reads `nextDueAt <= now()`. */
  readonly nextDueAt?: { readonly lte: Date } | null;
  /**
   * Phase 2.4: the SLA summary counts by profile and flags, scoped by the same
   * ticket visibility clauses the lists use (`where.ticket.is`).
   */
  readonly ticket?: { readonly is: InMemoryTicketWhere };
};

export function createInMemoryTicketSlaStateDelegate(
  states: Map<string, TicketSlaStateRecord>,
  nextId: (prefix: string) => string,
  now: () => Date,
  findTicket: (ticketId: string) => TicketRecord | null = () => null,
  getTicketRelations: () => InMemoryTicketRelations = () => ({}),
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
      orderBy,
      take,
    }: {
      where?: TicketSlaStateWhere;
      orderBy?: { readonly nextDueAt?: 'asc' | 'desc' };
      take?: number;
    } = {}) => {
      const matched = [...states.values()].filter((row) =>
        matchesTicketSlaStateWhere(row, where, findTicket, getTicketRelations),
      );
      if (orderBy?.nextDueAt !== undefined) {
        const direction = orderBy.nextDueAt;
        matched.sort((left, right) =>
          compareNextDueAt(left.nextDueAt, right.nextDueAt, direction),
        );
      }
      return take === undefined ? matched : matched.slice(0, take);
    },
    count: async ({ where }: { where?: TicketSlaStateWhere } = {}) =>
      [...states.values()].filter((row) =>
        matchesTicketSlaStateWhere(row, where, findTicket, getTicketRelations),
      ).length,
    groupBy: async ({
      by,
      where,
    }: {
      by: readonly string[];
      where?: TicketSlaStateWhere;
      _count?: unknown;
    }) => {
      const groups = new Map<string, Record<string, unknown>>();
      for (const state of states.values()) {
        if (!matchesTicketSlaStateWhere(state, where, findTicket, getTicketRelations)) {
          continue;
        }
        const row = state as unknown as Record<string, unknown>;
        const key = by.map((field) => String(row[field])).join('\u0000');
        const group = groups.get(key) ?? {
          ...Object.fromEntries(by.map((field) => [field, row[field]])),
          _count: { _all: 0 },
        };
        (group._count as { _all: number })._all += 1;
        groups.set(key, group);
      }
      return [...groups.values()];
    },
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

/** Nulls last, the way PostgreSQL orders them for an ascending sort. */
function compareNextDueAt(
  left: Date | null,
  right: Date | null,
  direction: 'asc' | 'desc',
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  const order = left.getTime() - right.getTime();
  return direction === 'asc' ? order : -order;
}

function matchesTicketSlaStateWhere(
  row: TicketSlaStateRecord,
  where?: TicketSlaStateWhere,
  findTicket: (ticketId: string) => TicketRecord | null = () => null,
  getTicketRelations: () => InMemoryTicketRelations = () => ({}),
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.ticket !== undefined) {
    const ticket = findTicket(row.ticketId);
    if (
      ticket === null ||
      !matchesInMemoryTicket(ticket, where.ticket.is, getTicketRelations())
    ) {
      return false;
    }
  }
  if (
    where.resolutionCompletedAt === null &&
    row.resolutionCompletedAt !== null
  ) {
    return false;
  }
  if (where.nextDueAt !== undefined) {
    // `null` in the filter means "no scheduling" (an in-memory equivalent of
    // `where: { nextDueAt: null }`); the scanner always passes `{ lte }`.
    if (where.nextDueAt === null) {
      if (row.nextDueAt !== null) {
        return false;
      }
    } else if (
      row.nextDueAt === null ||
      row.nextDueAt.getTime() > where.nextDueAt.lte.getTime()
    ) {
      return false;
    }
  }
  if (where.ticketId === undefined) {
    return true;
  }
  if (typeof where.ticketId === 'string') {
    return row.ticketId === where.ticketId;
  }
  return where.ticketId.in.includes(row.ticketId);
}
