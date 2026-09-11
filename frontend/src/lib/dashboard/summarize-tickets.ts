import { ticketStatusValues } from "@/lib/tickets/ticket-constants";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

export type TicketStatusCount = {
  readonly status: TicketStatus;
  readonly count: number;
};

export type DashboardSummary = {
  readonly total: number;
  readonly open: number;
  readonly waitingForUser: number;
  readonly pendingApproval: number;
  readonly resolved: number;
  readonly closed: number;
  readonly unrouted: number;
  readonly unassigned: number;
  readonly assignedToMe: number;
  readonly requestedByMe: number;
  readonly statusCounts: readonly TicketStatusCount[];
  readonly recent: readonly TicketResponse[];
};

/// Statuses that still require handler attention.
const openStatuses: readonly TicketStatus[] = [
  "PENDING",
  "UNROUTED",
  "ASSIGNED",
  "IN_PROGRESS",
];

export const dashboardRecentTicketLimit = 8;

export function summarizeTickets(
  tickets: readonly TicketResponse[],
  currentUserId: string | null,
): DashboardSummary {
  const countByStatus = (status: TicketStatus): number =>
    tickets.filter((ticket) => ticket.status === status).length;
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => openStatuses.includes(ticket.status)).length,
    waitingForUser: countByStatus("WAITING_FOR_USER"),
    pendingApproval: countByStatus("PENDING_APPROVAL"),
    resolved: countByStatus("RESOLVED"),
    closed: countByStatus("CLOSED"),
    unrouted: countByStatus("UNROUTED"),
    unassigned: tickets.filter(
      (ticket) =>
        ticket.assignedUserId === null && !isTerminal(ticket.status),
    ).length,
    assignedToMe:
      currentUserId === null
        ? 0
        : tickets.filter((ticket) => ticket.assignedUserId === currentUserId)
            .length,
    requestedByMe:
      currentUserId === null
        ? 0
        : tickets.filter((ticket) => ticket.requesterId === currentUserId).length,
    statusCounts: ticketStatusValues
      .map((status) => ({ status, count: countByStatus(status) }))
      .filter((entry) => entry.count > 0),
    recent: [...tickets]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, dashboardRecentTicketLimit),
  };
}

function isTerminal(status: TicketStatus): boolean {
  return status === "CLOSED" || status === "ARCHIVED" || status === "RESOLVED";
}
