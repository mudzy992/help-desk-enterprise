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
  /** Package 1.2 (M7): leave out merged child tickets. */
  readonly hideMerged?: boolean;
  /**
   * Package 1.6, staff only (ignored for requesters): `any` = forwarded at least
   * once; `toMyGroups` = forwarded and currently in one of the caller's groups.
   */
  readonly forwarded?: 'any' | 'toMyGroups';
  /** Package 1.7 (U3): unrouted past the cleanup deadline. */
  readonly unroutedOverdue?: boolean;
  /**
   * Resolved server-side from the unrouted-queue settings (never from the
   * client); without it the filter uses the defaults (8 h, no target group).
   */
  readonly unroutedOverdueScope?: {
    readonly cutoffIso: string;
    readonly targetGroupId: string | null;
  };
  readonly overdue?: boolean;
  readonly atRisk?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly q?: string;
  /**
   * `q` matches the ticket number and the title. The description is searched
   * only when the caller asks for it: the export always does, the ticket list
   * does (its search box did before phase 1.1 moved the filtering server-side),
   * the global `/search` endpoint does not.
   */
  readonly searchDescription?: boolean;
  /**
   * Internal: narrows to tickets that carry a CSAT submission. The CSAT summary
   * uses it so its read stays bounded instead of listing every visible ticket.
   */
  readonly hasCsatSubmission?: boolean;
  readonly includeArchived?: boolean;
  readonly sort?: TicketListSortField;
  readonly dir?: TicketListSortDirection;
  readonly page?: number;
  readonly pageSize?: number;
};
