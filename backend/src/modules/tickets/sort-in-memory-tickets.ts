import type { TicketRecord } from './tickets.types';
import type { InMemoryTicketOrderBy } from './in-memory-ticket-where';

export function sortInMemoryTickets(
  tickets: TicketRecord[],
  orderBy?: InMemoryTicketOrderBy,
): TicketRecord[] {
  const keys = Array.isArray(orderBy)
    ? orderBy
    : [orderBy ?? { createdAt: 'desc' as const }];
  return tickets.sort((left, right) => compareTickets(left, right, keys));
}

function compareTickets(
  left: TicketRecord,
  right: TicketRecord,
  keys: ReadonlyArray<{
    createdAt?: 'asc' | 'desc';
    updatedAt?: 'asc' | 'desc';
    id?: 'asc' | 'desc';
  }>,
): number {
  for (const key of keys) {
    const created = compareDate(left.createdAt, right.createdAt, key.createdAt);
    if (created !== 0) {
      return created;
    }
    const updated = compareDate(left.updatedAt, right.updatedAt, key.updatedAt);
    if (updated !== 0) {
      return updated;
    }
    if (key.id !== undefined) {
      const ranked = left.id.localeCompare(right.id);
      return key.id === 'asc' ? ranked : -ranked;
    }
  }
  return 0;
}

function compareDate(
  left: Date,
  right: Date,
  direction?: 'asc' | 'desc',
): number {
  if (direction === undefined) {
    return 0;
  }
  const ranked = left.getTime() - right.getTime();
  return direction === 'asc' ? ranked : -ranked;
}
