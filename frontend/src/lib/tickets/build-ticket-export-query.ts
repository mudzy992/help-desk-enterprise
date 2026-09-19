import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { TicketsExportQuery } from "@/services/tickets-export-api";

/**
 * Maps the filters applied on the ticket list to the export query so the CSV
 * matches what the person currently sees.
 */
export function buildTicketExportQuery(
  filters: TicketListFilters,
): TicketsExportQuery {
  const currentUserId = filters.currentUserId ?? "";
  const assignedUserId =
    filters.assignedUserId.length > 0
      ? filters.assignedUserId
      : filters.view === "assigned" && currentUserId.length > 0
        ? currentUserId
        : undefined;
  return {
    q: filters.search,
    status: filters.status === "" ? undefined : filters.status,
    priority: filters.priority === "" ? undefined : filters.priority,
    serviceId: filters.serviceId === "" ? undefined : filters.serviceId,
    assignedUserId,
    requesterId:
      filters.view === "requested" && currentUserId.length > 0
        ? currentUserId
        : undefined,
    unassigned: filters.view === "unassigned" ? true : undefined,
    overdue: filters.overdue ? true : undefined,
    createdFrom: filters.createdFrom === "" ? undefined : filters.createdFrom,
    createdTo: filters.createdTo === "" ? undefined : filters.createdTo,
  };
}
