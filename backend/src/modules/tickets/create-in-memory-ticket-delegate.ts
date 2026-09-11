import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type { TicketRecord } from './tickets.types';

export type InMemoryTicketWhere = {
  id?: string;
  originUnitId?: string;
  serviceId?: string;
  status?: string;
  requesterId?: string;
};

export function matchesInMemoryTicket(
  ticket: TicketRecord,
  where?: InMemoryTicketWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.id !== undefined && ticket.id !== where.id) {
    return false;
  }
  if (
    where.originUnitId !== undefined &&
    ticket.originUnitId !== where.originUnitId
  ) {
    return false;
  }
  if (where.serviceId !== undefined && ticket.serviceId !== where.serviceId) {
    return false;
  }
  if (where.status !== undefined && ticket.status !== where.status) {
    return false;
  }
  if (
    where.requesterId !== undefined &&
    ticket.requesterId !== where.requesterId
  ) {
    return false;
  }
  return true;
}

export function createInMemoryTicketDelegate(
  tickets: Map<string, TicketRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({
      where,
    }: {
      where: { id: string };
    }) => tickets.get(where.id) ?? null,
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: InMemoryTicketWhere;
      orderBy?: { createdAt?: 'asc' | 'desc' };
    } = {}) => {
      const matched = [...tickets.values()].filter((ticket) =>
        matchesInMemoryTicket(ticket, where),
      );
      const direction = orderBy?.createdAt === 'asc' ? 1 : -1;
      return matched.sort(
        (left, right) =>
          (left.createdAt.getTime() - right.createdAt.getTime()) * direction,
      );
    },
    count: async ({ where }: { where?: InMemoryTicketWhere } = {}) =>
      [...tickets.values()].filter((ticket) =>
        matchesInMemoryTicket(ticket, where),
      ).length,
    create: async ({ data }: { data: Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }) => {
      const created: TicketRecord = {
        ...data,
        id: data.id ?? nextId(),
        formData: data.formData ?? null,
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
