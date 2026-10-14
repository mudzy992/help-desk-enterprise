import type { TicketPriority, TicketStatus } from "@/services/tickets-api";
import type { TicketTranslationKey } from "@/lib/tickets/ticket-translation-key";

export const ticketListPageSize = 25;
export const unroutedTicketPageSize = 50;

/**
 * Gornja granica koju server prihvata za `GET /tickets?pageSize=`. DTO je
 * odbija sa `VALIDATION` iznad ove vrijednosti
 * (`backend/src/modules/tickets/dto/list-tickets-query.dto.ts`, `@Max(50)`),
 * pa svaki pozivalac mora ostati ispod nje — vidi `load-dashboard-volume.ts`.
 */
export const ticketListMaxPageSize = 50;

// Paket 5.3.1 (D10): "All tickets" leads, the group inbox is its second tab.
export const ticketWorkspaceViews = [
  "all",
  "inbox",
  "assigned",
  "unassigned",
  "requested",
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
  UNROUTED: ["PENDING", "CLOSED"],
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
} as const satisfies Readonly<Record<TicketStatus, TicketTranslationKey>>;

export type TicketStatusTranslationKey =
  (typeof ticketStatusLabelKey)[keyof typeof ticketStatusLabelKey];

export const ticketPriorityLabelKey = {
  LOW: "tickets.priority.LOW",
  MEDIUM: "tickets.priority.MEDIUM",
  HIGH: "tickets.priority.HIGH",
  CRITICAL: "tickets.priority.CRITICAL",
} as const satisfies Readonly<Record<TicketPriority, TicketTranslationKey>>;

export type TicketPriorityTranslationKey =
  (typeof ticketPriorityLabelKey)[keyof typeof ticketPriorityLabelKey];

export const ticketSeverityLabelKey = {
  LOW: "tickets.severity.LOW",
  MEDIUM: "tickets.severity.MEDIUM",
  HIGH: "tickets.severity.HIGH",
  CRITICAL: "tickets.severity.CRITICAL",
} as const satisfies Readonly<Record<TicketPriority, TicketTranslationKey>>;

export type TicketSeverityTranslationKey =
  (typeof ticketSeverityLabelKey)[keyof typeof ticketSeverityLabelKey];

export const ticketViewLabelKey = {
  inbox: "tickets.views.inbox",
  assigned: "tickets.views.assigned",
  unassigned: "tickets.views.unassigned",
  requested: "tickets.views.requested",
  all: "tickets.views.all",
} as const satisfies Readonly<Record<TicketWorkspaceView, TicketTranslationKey>>;

function hasOwnStringKey<T extends object>(
  record: T,
  key: string,
): key is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function ticketStatusTranslationKey(value: string): TicketStatusTranslationKey | null {
  return hasOwnStringKey(ticketStatusLabelKey, value) ? ticketStatusLabelKey[value] : null;
}

export function ticketPriorityTranslationKey(value: string): TicketPriorityTranslationKey | null {
  return hasOwnStringKey(ticketPriorityLabelKey, value) ? ticketPriorityLabelKey[value] : null;
}

export function ticketSeverityTranslationKey(value: string): TicketSeverityTranslationKey | null {
  return hasOwnStringKey(ticketSeverityLabelKey, value) ? ticketSeverityLabelKey[value] : null;
}
