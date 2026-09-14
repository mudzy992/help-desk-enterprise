import { isTicketOverdue } from "@/lib/tickets/filter-tickets";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

/// Statuses that still require handler attention (same set as KPI "open").
const openStatuses: readonly TicketStatus[] = [
  "PENDING",
  "UNROUTED",
  "ASSIGNED",
  "IN_PROGRESS",
];

export const dashboardSlaWatchlistLimit = 5;
export const dashboardAttentionTicketLimit = 8;

export type InboxGroupCount = {
  readonly groupId: string | null;
  readonly label: string;
  readonly count: number;
};

export function isDashboardOpenTicket(
  ticket: Pick<TicketResponse, "status">,
): boolean {
  return openStatuses.includes(ticket.status);
}

export function selectSlaWatchlist(
  tickets: readonly TicketResponse[],
): readonly TicketResponse[] {
  return tickets
    .filter(isTicketOverdue)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, dashboardSlaWatchlistLimit);
}

function isTerminalTicket(ticket: Pick<TicketResponse, "status">): boolean {
  return (
    ticket.status === "CLOSED" ||
    ticket.status === "ARCHIVED" ||
    ticket.status === "RESOLVED"
  );
}

function isUnroutedTicket(ticket: TicketResponse): boolean {
  return ticket.status === "UNROUTED" || ticket.assignedGroupId === null;
}

function isAssignedToCurrentUser(
  ticket: TicketResponse,
  currentUserId: string | null,
): boolean {
  return (
    currentUserId !== null &&
    ticket.assignedUserId === currentUserId &&
    !isTerminalTicket(ticket)
  );
}

function isCriticalWithoutOwner(ticket: TicketResponse): boolean {
  return (
    ticket.priority === "CRITICAL" &&
    ticket.assignedUserId === null &&
    !isTerminalTicket(ticket)
  );
}

export function selectAttentionTickets(
  tickets: readonly TicketResponse[],
  currentUserId: string | null,
): readonly TicketResponse[] {
  const selected: TicketResponse[] = [];
  const seen = new Set<string>();
  const append = (ticket: TicketResponse): void => {
    if (seen.has(ticket.id) || selected.length >= dashboardAttentionTicketLimit) {
      return;
    }
    seen.add(ticket.id);
    selected.push(ticket);
  };
  for (const ticket of tickets) {
    if (isAssignedToCurrentUser(ticket, currentUserId)) {
      append(ticket);
    }
  }
  for (const ticket of tickets) {
    if (isCriticalWithoutOwner(ticket)) {
      append(ticket);
    }
  }
  for (const ticket of tickets) {
    if (isUnroutedTicket(ticket) && !isTerminalTicket(ticket)) {
      append(ticket);
    }
  }
  return selected;
}

export function recentTicketsExcluding(
  recent: readonly TicketResponse[],
  excluded: readonly TicketResponse[],
): readonly TicketResponse[] {
  const skip = new Set(excluded.map((ticket) => ticket.id));
  return recent.filter((ticket) => !skip.has(ticket.id));
}

export function groupInboxCounts(
  inboxTickets: readonly TicketResponse[],
  groupNames: ReadonlyMap<string, string> = new Map(),
): readonly InboxGroupCount[] {
  const counts = new Map<string, number>();
  for (const ticket of inboxTickets) {
    const key = ticket.assignedGroupId ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      groupId: key.length === 0 ? null : key,
      label:
        key.length === 0 ? "" : (groupNames.get(key) ?? truncateIdentifier(key)),
      count,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (left.groupId === null) {
        return 1;
      }
      if (right.groupId === null) {
        return -1;
      }
      return left.label.localeCompare(right.label);
    });
}
