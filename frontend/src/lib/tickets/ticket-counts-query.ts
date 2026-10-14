import { queryKeys } from "@/lib/query/query-keys";
import { getTicketCounts, type TicketCountsQuery } from "@/services/tickets-counts-api";

export const ticketCountsStaleTimeMilliseconds = 30_000;

/** Shared React Query configuration for list tabs and sidebar badges. */
export function ticketCountsQueryOptions(query: TicketCountsQuery = {}) {
  return {
    queryKey: queryKeys.ticketCounts(query),
    queryFn: () => getTicketCounts(query),
    staleTime: ticketCountsStaleTimeMilliseconds,
  } as const;
}
