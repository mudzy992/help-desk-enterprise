import type { TicketStatus } from "@/services/tickets-api";

const closedStatuses: readonly TicketStatus[] = ["CLOSED", "ARCHIVED"];

export function isBulkCloseStatus(status: string): boolean {
  return closedStatuses.includes(status as TicketStatus);
}
