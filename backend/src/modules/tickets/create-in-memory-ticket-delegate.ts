import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type {
  InMemoryTicketOrderBy,
  InMemoryTicketRelations,
  InMemoryTicketWhere,
} from './in-memory-ticket-where';
import { matchesInMemoryTicket } from './matches-in-memory-ticket';
import { sortInMemoryTickets } from './sort-in-memory-tickets';
import type { TicketRecord } from './tickets.types';

export function createInMemoryTicketDelegate(
  tickets: Map<string, TicketRecord>,
  nextId: () => string,
  now: () => Date,
  relations: InMemoryTicketRelations = {},
) {
  const matching = (where?: InMemoryTicketWhere) =>
    [...tickets.values()].filter((ticket) =>
      matchesInMemoryTicket(ticket, where, relations),
    );
  const list = async (
    where?: InMemoryTicketWhere,
    orderBy?: InMemoryTicketOrderBy,
    window: { skip?: number; take?: number } = {},
  ) => {
    const sorted = sortInMemoryTickets(matching(where), orderBy, relations);
    const start = window.skip ?? 0;
    return window.take === undefined
      ? sorted.slice(start)
      : sorted.slice(start, start + window.take);
  };
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      tickets.get(where.id) ?? null,
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: InMemoryTicketWhere;
      orderBy?: InMemoryTicketOrderBy;
      select?: Record<string, boolean>;
    } = {}) => {
      const [first] = await list(where, orderBy);
      return pickInMemoryFields(first, select);
    },
    findMany: async ({
      where,
      orderBy,
      skip,
      take,
    }: {
      where?: InMemoryTicketWhere;
      orderBy?: InMemoryTicketOrderBy;
      skip?: number;
      take?: number;
    } = {}) => list(where, orderBy, { skip, take }),
    count: async ({ where }: { where?: InMemoryTicketWhere } = {}) =>
      matching(where).length,
    create: async ({
      data,
    }: {
      data: Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      const created: TicketRecord = {
        ...data,
        id: data.id ?? nextId(),
        formData: data.formData ?? null,
        reopenedFromTicketId: data.reopenedFromTicketId ?? null,
        parentTicketId: data.parentTicketId ?? null,
        mergedIntoTicketId: data.mergedIntoTicketId ?? null,
        closeCodeId: data.closeCodeId ?? null,
        resolutionNote: data.resolutionNote ?? null,
        resolvedAt: data.resolvedAt ?? null,
        closedAt: data.closedAt ?? null,
        archivedAt: data.archivedAt ?? null,
        waitingForUserEnteredAt: data.waitingForUserEnteredAt ?? null,
        waitingForUserReminderSentAt: data.waitingForUserReminderSentAt ?? null,
        firstResponseAt: data.firstResponseAt ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      tickets.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<TicketRecord>;
    }) => {
      const current = tickets.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: TicketRecord = {
        ...current,
        ...data,
        updatedAt: now(),
      };
      tickets.set(updated.id, updated);
      return updated;
    },
    groupBy: async ({
      by,
      where,
    }: {
      by: readonly string[];
      where?: InMemoryTicketWhere;
      _count?: unknown;
    }) => {
      const groups = new Map<string, Record<string, unknown>>();
      for (const ticket of matching(where)) {
        const row = ticket as unknown as Record<string, unknown>;
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
    // Match and write in one synchronous step, like a single SQL UPDATE, so
    // tests can exercise the "lost the race" path deterministically.
    updateMany: async ({
      where,
      data,
    }: {
      where?: InMemoryTicketWhere;
      data: Partial<TicketRecord>;
    }) => {
      const matched = matching(where);
      for (const ticket of matched) {
        tickets.set(ticket.id, { ...ticket, ...data, updatedAt: now() });
      }
      return { count: matched.length };
    },
  };
}

export { pickInMemoryFields };
export type { InMemoryTicketWhere } from './in-memory-ticket-where';
