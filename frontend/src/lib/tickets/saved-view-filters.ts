import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { SavedViewResponse } from "@/services/tickets-saved-views-api";

export function filtersFromSavedView(
  current: TicketListFilters,
  view: SavedViewResponse,
): TicketListFilters {
  return {
    ...current,
    search: view.filters.search ?? "",
    status: view.filters.status ?? "",
    priority: view.filters.priority ?? "",
    serviceId: view.filters.serviceId ?? "",
    assignedUserId: view.filters.assignedUserId ?? "",
    createdFrom: view.filters.createdFrom ?? "",
    createdTo: view.filters.createdTo ?? "",
    overdue: view.filters.overdue === true,
  };
}

/**
 * Does the list currently show exactly this saved view? Fields the view does not
 * store (workspace view, forwarded/personal/hide-merged) are ignored, so the
 * "active view" badge disappears as soon as the user edits one of its filters.
 */
export function savedViewMatchesFilters(
  view: SavedViewResponse,
  filters: TicketListFilters,
): boolean {
  const saved = filtersFromSavedView(filters, view);
  return (
    saved.search === filters.search &&
    saved.status === filters.status &&
    saved.priority === filters.priority &&
    saved.serviceId === filters.serviceId &&
    saved.assignedUserId === filters.assignedUserId &&
    saved.createdFrom === filters.createdFrom &&
    saved.createdTo === filters.createdTo &&
    saved.overdue === filters.overdue
  );
}

export function savedViewInputFromFilters(
  name: string,
  filters: TicketListFilters,
  isDefault: boolean,
) {
  return {
    name,
    filters: {
      search: filters.search,
      status: filters.status,
      priority: filters.priority,
      serviceId: filters.serviceId,
      assignedUserId: filters.assignedUserId,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      overdue: filters.overdue,
    },
    sort: { field: "updatedAt" as const, direction: "desc" as const },
    isDefault,
  };
}
