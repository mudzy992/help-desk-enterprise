import type { TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import type { TicketPriority, TicketStatus, TicketResponse } from "@/services/tickets-api";

export type TicketListFilters = {
  readonly view: TicketWorkspaceView;
  readonly search: string;
  readonly status: TicketStatus | "";
  readonly priority: TicketPriority | "";
  readonly serviceId: string;
  readonly assignedUserId: string;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly overdue: boolean;
  /** Package 1.6, staff only. */
  readonly forwarded?: TicketForwardedFilter;
  readonly currentUserId: string | null;
};

export type TicketForwardedFilter = "" | "any" | "toMyGroups";

export function parseForwardedFilter(value: string | null): TicketForwardedFilter {
  return value === "any" || value === "toMyGroups" ? value : "";
}

export function isTicketOverdue(
  ticket: Pick<TicketResponse, "isOverdue">,
): boolean {
  return ticket.isOverdue === true;
}

export function matchesTicketSearch(
  ticket: TicketResponse,
  search: string,
): boolean {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return true;
  }
  return (
    ticket.ticketNumber.toLowerCase().includes(query) ||
    ticket.title.toLowerCase().includes(query) ||
    ticket.description.toLowerCase().includes(query)
  );
}

export function matchesTicketView(
  ticket: TicketResponse,
  view: TicketWorkspaceView,
  currentUserId: string | null,
): boolean {
  if (view === "all" || view === "inbox") {
    return true;
  }
  if (view === "assigned") {
    return currentUserId !== null && ticket.assignedUserId === currentUserId;
  }
  if (view === "requested") {
    return currentUserId !== null && ticket.requesterId === currentUserId;
  }
  return ticket.assignedUserId === null;
}

export function clearedTicketListFilters(
  filters: TicketListFilters,
): TicketListFilters {
  return {
    ...filters,
    search: "",
    status: "",
    priority: "",
    serviceId: "",
    assignedUserId: "",
    createdFrom: "",
    createdTo: "",
    overdue: false,
    forwarded: "",
  };
}

export function filterTickets(
  tickets: readonly TicketResponse[],
  filters: TicketListFilters,
): readonly TicketResponse[] {
  return tickets.filter((ticket) => {
    if (!matchesTicketSearch(ticket, filters.search)) {
      return false;
    }
    if (filters.status !== "" && ticket.status !== filters.status) {
      return false;
    }
    if (filters.priority !== "" && ticket.priority !== filters.priority) {
      return false;
    }
    if (filters.serviceId !== "" && ticket.serviceId !== filters.serviceId) {
      return false;
    }
    if (filters.assignedUserId !== "" && ticket.assignedUserId !== filters.assignedUserId) {
      return false;
    }
    if (filters.createdFrom !== "" && ticket.createdAt < filters.createdFrom) {
      return false;
    }
    if (filters.createdTo !== "" && ticket.createdAt > filters.createdTo) {
      return false;
    }
    if (filters.overdue && !isTicketOverdue(ticket)) {
      return false;
    }
    return matchesTicketView(ticket, filters.view, filters.currentUserId);
  });
}
