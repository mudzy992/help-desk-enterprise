import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import { ticketListPageSize } from "@/lib/tickets/ticket-constants";
import type {
  TicketCountsQuery,
  TicketPageQuery,
} from "@/lib/tickets/ticket-list-search-params";

/**
 * Turns the screen state of the ticket list into the server query of one page
 * (phase 1.1, plan §1.1).
 *
 * Before this the list was fetched whole and filtered in the browser; every
 * filter the screen offers has an equivalent in `GET /tickets`, so the same
 * narrowing now runs in SQL and only the current page travels. The workspace
 * views map onto the same vocabulary:
 *
 * - `assigned`   → `assignedUserId` = the current user
 * - `requested`  → `requesterId` = the current user
 * - `unassigned` → `unassigned = true`
 *
 * Deliberate detail: inside the `assigned` view the explicit "assignee" filter
 * is superseded by the view (the view already means "mine", and the API takes a
 * single `assignedUserId`). Everywhere else the filter is passed through.
 */
export function toTicketPageQuery(input: {
  readonly filters: TicketListFilters;
  readonly view: TicketWorkspaceView;
  readonly currentUserId: string | null;
  readonly page: number;
  readonly pageSize?: number;
}): TicketPageQuery {
  const { filters, view, currentUserId, page } = input;
  const term = filters.search.trim();
  return {
    ...toViewFilters({ view, currentUserId, filters }),
    status: filters.status === "" ? undefined : filters.status,
    priority: filters.priority === "" ? undefined : filters.priority,
    serviceId: filters.serviceId === "" ? undefined : filters.serviceId,
    createdFrom: filters.createdFrom === "" ? undefined : filters.createdFrom,
    createdTo: filters.createdTo === "" ? undefined : filters.createdTo,
    overdue: filters.overdue ? true : undefined,
    forwarded: filters.forwarded ? filters.forwarded : undefined,
    hideMerged: filters.hideMerged === true ? true : undefined,
    unroutedOverdue: filters.unroutedOverdue === true ? true : undefined,
    q: term === "" ? undefined : term,
    // The list search box matched the description before phase 1.1 moved the
    // filtering to the server, so it keeps that reach here.
    searchDescription: term === "" ? undefined : true,
    page,
    pageSize: input.pageSize ?? ticketListPageSize,
  };
}

/**
 * The narrowing of the tab counters next to the list. The counts endpoint takes
 * no `status` (it breaks the statuses down itself), so the view narrowing is
 * carried over and the status filter is dropped.
 */
export function toTicketCountsQuery(
  query: TicketPageQuery,
): TicketCountsQuery {
  return {
    originUnitId: query.originUnitId,
    serviceId: query.serviceId,
    assignedUserId: query.assignedUserId,
    priority: query.priority,
    requesterId: query.requesterId,
    groupId: query.groupId,
    unassigned: query.unassigned,
    forwarded: query.forwarded,
    hideMerged: query.hideMerged,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    q: query.q,
  };
}

function toViewFilters(input: {
  readonly view: TicketWorkspaceView;
  readonly currentUserId: string | null;
  readonly filters: TicketListFilters;
}): Pick<TicketPageQuery, "assignedUserId" | "requesterId" | "unassigned"> {
  const { view, currentUserId, filters } = input;
  if (view === "assigned") {
    return { assignedUserId: currentUserId ?? undefined };
  }
  if (view === "requested") {
    return {
      requesterId: currentUserId ?? undefined,
      assignedUserId: filters.assignedUserId === "" ? undefined : filters.assignedUserId,
    };
  }
  if (view === "unassigned") {
    return { unassigned: true };
  }
  return {
    assignedUserId: filters.assignedUserId === "" ? undefined : filters.assignedUserId,
  };
}
