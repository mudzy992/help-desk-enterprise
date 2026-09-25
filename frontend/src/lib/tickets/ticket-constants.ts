import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

export const ticketListPageSize = 25;

export const ticketWorkspaceViews = [
  "inbox",
  "assigned",
  "unassigned",
  "requested",
  "all",
] as const;

export type TicketWorkspaceView = (typeof ticketWorkspaceViews)[number];

const requesterWorkspaceViews: readonly TicketWorkspaceView[] = ["requested", "all"];

/** Requesters see only their own tickets; the queue views are for staff. */
export function workspaceViewsFor(isStaff: boolean): readonly TicketWorkspaceView[] {
  return isStaff ? ticketWorkspaceViews : requesterWorkspaceViews;
}

export const ticketStatusValues: readonly TicketStatus[] = [
  "PENDING",
  "UNROUTED",
  "PENDING_APPROVAL",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
  "ARCHIVED",
];

export const ticketPriorityValues: readonly TicketPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export const claimableTicketStatuses: readonly TicketStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
];

export const allowedTicketStatusTransitions: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  PENDING: ["ASSIGNED", "IN_PROGRESS", "CLOSED"],
  UNROUTED: ["PENDING"],
  PENDING_APPROVAL: [],
  ASSIGNED: ["IN_PROGRESS", "PENDING", "WAITING_FOR_USER", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "ASSIGNED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  ARCHIVED: [],
};

export const ticketStatusLabelKey = {
  PENDING: "tickets.status.PENDING",
  UNROUTED: "tickets.status.UNROUTED",
  PENDING_APPROVAL: "tickets.status.PENDING_APPROVAL",
  ASSIGNED: "tickets.status.ASSIGNED",
  IN_PROGRESS: "tickets.status.IN_PROGRESS",
  WAITING_FOR_USER: "tickets.status.WAITING_FOR_USER",
  RESOLVED: "tickets.status.RESOLVED",
  CLOSED: "tickets.status.CLOSED",
  ARCHIVED: "tickets.status.ARCHIVED",
} as const;

export const ticketPriorityLabelKey = {
  LOW: "tickets.priority.LOW",
  MEDIUM: "tickets.priority.MEDIUM",
  HIGH: "tickets.priority.HIGH",
  CRITICAL: "tickets.priority.CRITICAL",
} as const;

export const ticketSeverityLabelKey = {
  LOW: "tickets.severity.LOW",
  MEDIUM: "tickets.severity.MEDIUM",
  HIGH: "tickets.severity.HIGH",
  CRITICAL: "tickets.severity.CRITICAL",
} as const;

export const ticketViewLabelKey = {
  inbox: "tickets.views.inbox",
  assigned: "tickets.views.assigned",
  unassigned: "tickets.views.unassigned",
  requested: "tickets.views.requested",
  all: "tickets.views.all",
} as const;

