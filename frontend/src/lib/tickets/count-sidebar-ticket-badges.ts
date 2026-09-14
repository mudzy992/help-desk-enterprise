import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

export type SidebarTicketCounts = {
  readonly openTicketCount: number;
  readonly inboxBadgeCount: number;
  readonly unroutedCount: number;
};

const closedSidebarTicketStatuses: ReadonlySet<TicketStatus> = new Set([
  "CLOSED",
  "RESOLVED",
  "ARCHIVED",
]);

export function countSidebarTicketBadges(
  tickets: readonly TicketResponse[],
  inbox: readonly TicketResponse[],
): SidebarTicketCounts {
  const openTicketCount = tickets.filter(
    (ticket) => !closedSidebarTicketStatuses.has(ticket.status),
  ).length;
  const unroutedCount = tickets.filter(
    (ticket) => ticket.status === "UNROUTED",
  ).length;
  return {
    openTicketCount,
    inboxBadgeCount: inbox.length + unroutedCount,
    unroutedCount,
  };
}
