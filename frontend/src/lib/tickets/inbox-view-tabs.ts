import type { TicketResponse } from "@/services/tickets-api";

export const unroutedInboxTabKey = "unrouted";

export type InboxGroupTab = {
  readonly groupId: string;
  readonly count: number;
};

export function inboxGroupTabsFromInboxTickets(
  inboxTickets: readonly TicketResponse[],
): readonly InboxGroupTab[] {
  const counts = new Map<string, number>();
  for (const ticket of inboxTickets) {
    if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
      continue;
    }
    counts.set(ticket.assignedGroupId, (counts.get(ticket.assignedGroupId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([groupId, count]) => ({ groupId, count }))
    .sort((left, right) => left.groupId.localeCompare(right.groupId));
}

export function ticketsForInboxTab(
  tab: string,
  inboxTickets: readonly TicketResponse[],
  unroutedTickets: readonly TicketResponse[],
): readonly TicketResponse[] {
  if (tab === unroutedInboxTabKey) {
    return unroutedTickets.filter((ticket) => ticket.status === "UNROUTED");
  }
  return inboxTickets.filter(
    (ticket) => ticket.status !== "UNROUTED" && ticket.assignedGroupId === tab,
  );
}

export function unroutedTicketsFromList(
  tickets: readonly TicketResponse[],
): readonly TicketResponse[] {
  return tickets.filter((ticket) => ticket.status === "UNROUTED");
}
