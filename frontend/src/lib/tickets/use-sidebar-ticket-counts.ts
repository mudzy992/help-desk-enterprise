import { useQuery } from "@tanstack/react-query";
import {
  toSidebarTicketCounts,
  type SidebarTicketCounts,
} from "@/lib/tickets/count-sidebar-ticket-badges";
import { ticketCountsQueryOptions } from "@/lib/tickets/ticket-counts-query";

export type { SidebarTicketCounts };

/** Sidebar and ticket-list counters share the same React Query cache. */
export function useSidebarTicketCounts(includeInbox: boolean): SidebarTicketCounts | null {
  const query = useQuery(ticketCountsQueryOptions());
  return query.data === undefined ? null : toSidebarTicketCounts(query.data, includeInbox);
}
