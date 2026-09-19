import { apiDownloadRequest } from "@/services/api";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

export type TicketsExportQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly assignedUserId?: string;
  readonly requesterId?: string;
  readonly unassigned?: boolean;
  readonly overdue?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly q?: string;
};

export function buildTicketsExportSearch(query: TicketsExportQuery): string {
  const search = new URLSearchParams();
  const textEntries: ReadonlyArray<readonly [string, string | undefined]> = [
    ["originUnitId", query.originUnitId],
    ["serviceId", query.serviceId],
    ["status", query.status],
    ["priority", query.priority],
    ["assignedUserId", query.assignedUserId],
    ["requesterId", query.requesterId],
    ["createdFrom", query.createdFrom],
    ["createdTo", query.createdTo],
    ["q", query.q?.trim()],
  ];
  for (const [key, value] of textEntries) {
    if (value !== undefined && value.length > 0) {
      search.set(key, value);
    }
  }
  if (query.unassigned === true) {
    search.set("unassigned", "true");
  }
  if (query.overdue === true) {
    search.set("overdue", "true");
  }
  return search.toString();
}

export async function exportTicketsCsv(
  query: TicketsExportQuery,
): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const search = buildTicketsExportSearch(query);
  const downloaded = await apiDownloadRequest(
    `/tickets/export${search.length === 0 ? "" : `?${search}`}`,
  );
  return {
    blob: downloaded.blob,
    fileName: downloaded.fileName ?? "tickets.csv",
  };
}
