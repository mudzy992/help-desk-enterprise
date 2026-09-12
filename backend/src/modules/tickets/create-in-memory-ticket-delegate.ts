import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type {
  InMemoryTicketOrderBy,
  InMemoryTicketWhere,
} from './in-memory-ticket-where';
import { matchesInMemoryTicket } from './matches-in-memory-ticket';
import { sortInMemoryTickets } from './sort-in-memory-tickets';
import type { TicketRecord } from './tickets.types';

export function createInMemoryTicketDelegate(
  tickets: Map<string, TicketRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const list = async (
    where?: InMemoryTicketWhere,
    orderBy?: InMemoryTicketOrderBy,
  ) => {
    const matched = [...tickets.values()].filter((ticket) =>
      matchesInMemoryTicket(ticket, where),
    );
    return sortInMemoryTickets(matched, orderBy);
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
    }: {
      where?: InMemoryTicketWhere;
      orderBy?: InMemoryTicketOrderBy;
    } = {}) => list(where, orderBy),
    count: async ({ where }: { where?: InMemoryTicketWhere } = {}) =>
      [...tickets.values()].filter((ticket) =>
        matchesInMemoryTicket(ticket, where),
      ).length,
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
  };
}

export { pickInMemoryFields };
export type { InMemoryTicketWhere } from './in-memory-ticket-where';
