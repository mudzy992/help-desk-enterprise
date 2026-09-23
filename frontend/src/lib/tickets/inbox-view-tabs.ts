import type { MyGroupResponse } from "@/services/groups-api";
import type { TicketResponse } from "@/services/tickets-api";

export const unroutedInboxTabKey = "unrouted";

export type InboxGroupTab = {
  readonly groupId: string;
  readonly name: string;
  readonly count: number;
};

/**
 * Tabs come from group membership (`GET /groups/mine`), not from tickets
 * currently sitting in the inbox — a group with zero open tickets still gets
 * a tab, and the tab set no longer depends on what happens to be loaded
 * (INB-01). Counts are layered on top from the loaded inbox rows; sorted by
 * name per the F2 plan (item 2), not by the group's cuid.
 */
export function inboxGroupTabsFromMembership(
  myGroups: readonly MyGroupResponse[],
  inboxTickets: readonly TicketResponse[],
): readonly InboxGroupTab[] {
  const counts = new Map<string, number>();
  for (const ticket of inboxTickets) {
    if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
      continue;
    }
    counts.set(ticket.assignedGroupId, (counts.get(ticket.assignedGroupId) ?? 0) + 1);
  }
  return [...myGroups]
    .map((group) => ({
      groupId: group.id,
      name: group.name,
      count: counts.get(group.id) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
