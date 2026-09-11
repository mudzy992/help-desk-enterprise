import { apiRequest } from "@/services/api";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

export type SavedViewFilters = {
  readonly search?: string;
  readonly status?: TicketStatus | "";
  readonly priority?: TicketPriority | "";
  readonly serviceId?: string;
  readonly assignedUserId?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
};

export type SavedViewSort = {
  readonly field: "updatedAt" | "createdAt" | "priority" | "status";
  readonly direction: "asc" | "desc";
};

export type SavedViewResponse = {
  readonly id: string;
  readonly name: string;
  readonly filters: SavedViewFilters;
  readonly sort: SavedViewSort | null;
  readonly columns: readonly string[];
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SavedViewInput = {
  readonly name: string;
  readonly filters: SavedViewFilters;
  readonly sort?: SavedViewSort | null;
  readonly columns?: readonly string[];
  readonly isDefault?: boolean;
};

export function listSavedViews(): Promise<readonly SavedViewResponse[]> {
  return apiRequest("/tickets/saved-views");
}

export function createSavedView(input: SavedViewInput): Promise<SavedViewResponse> {
  return apiRequest("/tickets/saved-views", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSavedView(
  savedViewId: string,
  input: Partial<SavedViewInput>,
): Promise<SavedViewResponse> {
  return apiRequest(`/tickets/saved-views/${savedViewId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSavedView(savedViewId: string): Promise<void> {
  return apiRequest(`/tickets/saved-views/${savedViewId}`, { method: "DELETE" });
}
