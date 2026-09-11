import type { TicketStatus } from "@/services/tickets-api";

export function isResolveOrCloseStatus(status: TicketStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}
