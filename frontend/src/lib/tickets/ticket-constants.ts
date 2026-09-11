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
  PENDING: ["ASSIGNED", "IN_PROGRESS"],
  UNROUTED: ["PENDING"],
  PENDING_APPROVAL: [],
  ASSIGNED: ["IN_PROGRESS", "PENDING", "WAITING_FOR_USER"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "ASSIGNED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  ARCHIVED: [],
};
