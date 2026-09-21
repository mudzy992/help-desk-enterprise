import { toTicketListSearchParams } from "@/lib/tickets/ticket-list-search-params";
import type { TicketPageQuery } from "@/lib/tickets/ticket-list-search-params";
import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export type TicketPage = {
  readonly items: readonly TicketResponse[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

/**
 * One page of the tickets the caller may see, filtered, sorted and counted by
 * the server. Prefer this over `listTickets`, which downloads every ticket.
 */
export function listTicketsPage(query: TicketPageQuery = {}): Promise<TicketPage> {
  return apiRequest(`/tickets?${toTicketListSearchParams(query).toString()}`);
}
