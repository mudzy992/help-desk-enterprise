import type { Prisma } from '../../../generated/prisma/client';
import type {
  TicketListSortDirection,
  TicketListSortField,
} from './list-tickets.types';

function primaryOrder(
  sort: TicketListSortField,
  direction: TicketListSortDirection,
): Prisma.TicketOrderByWithRelationInput {
  switch (sort) {
    case 'slaDueAt':
      return { slaState: { resolutionDueAt: direction } };
    case 'updatedAt':
      return { updatedAt: direction };
    case 'priority':
      return { priority: direction };
    case 'status':
      return { status: direction };
    case 'createdAt':
      return { createdAt: direction };
  }
}

/**
 * `slaDueAt` orders by the resolution deadline of the SLA state. In Postgres a
 * missing deadline sorts last ascending, so "closest deadline first" puts
 * tickets without an SLA at the end. A trailing `id` keeps paging stable when
 * the sort values tie.
 */
export function buildTicketListOrderBy(
  sort: TicketListSortField = 'createdAt',
  direction: TicketListSortDirection = 'desc',
): Prisma.TicketOrderByWithRelationInput[] {
  const order = [primaryOrder(sort, direction)];
  if (sort !== 'updatedAt') {
    order.push({ updatedAt: 'desc' });
  }
  order.push({ id: 'asc' });
  return order;
}
