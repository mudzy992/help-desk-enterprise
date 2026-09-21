import type { TicketCounts } from "@/services/tickets-counts-api";

export type SidebarTicketCounts = {
  readonly openTicketCount: number;
  readonly inboxBadgeCount: number;
  readonly unroutedCount: number;
};

/**
 * Maps the server-side ticket counts to the sidebar badges. Unrouted tickets
 * need a person to route them, so they add to the inbox badge; only staff have
 * a group inbox of their own.
 */
export function toSidebarTicketCounts(
  counts: Pick<TicketCounts, "open" | "unrouted" | "inbox">,
  includeInbox: boolean,
): SidebarTicketCounts {
  return {
    openTicketCount: counts.open,
    unroutedCount: counts.unrouted,
    inboxBadgeCount: (includeInbox ? counts.inbox : 0) + counts.unrouted,
  };
}
