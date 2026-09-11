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
  };
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
    },
    sort: { field: "updatedAt" as const, direction: "desc" as const },
    isDefault,
  };
}
