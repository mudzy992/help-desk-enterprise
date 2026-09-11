import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export function submitTicketCsat(
  ticketId: string,
  input: { rating: number; comment?: string },
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/csat`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
