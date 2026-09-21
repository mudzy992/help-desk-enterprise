import type {
  TicketPriority,
  TicketStatus,
} from '../../../generated/prisma/enums';
import type {
  ticketListSortDirections,
  ticketListSortFields,
} from './list-tickets.constants';

export type TicketListSortField = (typeof ticketListSortFields)[number];
export type TicketListSortDirection = (typeof ticketListSortDirections)[number];

/**
 * One filter vocabulary for every reader of the ticket list (GET /tickets,
 * export, CSAT summary), so they cannot drift apart. Visibility is not part of
 * it: it is always derived from the caller, never from the query.
 */
export type TicketListQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus | readonly TicketStatus[];
  readonly assignedUserId?: string;
  readonly priority?: TicketPriority;
  readonly requesterId?: string;
  readonly groupId?: string;
  readonly unassigned?: boolean;
  readonly overdue?: boolean;
  readonly atRisk?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly q?: string;
  /** Internal: the export also searches the description, the list does not. */
  readonly searchDescription?: boolean;
  readonly includeArchived?: boolean;
  readonly sort?: TicketListSortField;
  readonly dir?: TicketListSortDirection;
  readonly page?: number;
  readonly pageSize?: number;
};
