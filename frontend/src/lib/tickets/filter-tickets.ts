import type { TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import type { TicketPriority, TicketStatus, TicketResponse } from "@/services/tickets-api";

/**
 * M8 B6: the inbox sub-tab key for the unrouted queue. Defined as a literal
 * here so this module does not pull UI code from inbox-view-tabs.
 */
export const unroutedInboxTabKey = "unrouted";

export type TicketListFilters = {
  readonly view: TicketWorkspaceView;
  readonly search: string;
  // Val 6.1 / modul 4 (D1): the UI still edits a single status at a time,
  // but deep-link URLs may carry repeated `status=` keys. We keep the public
  // type a single status (so existing filter controls and saved views do not
  // have to learn about arrays) and only flatten to an array when building
  // the server query (`toTicketPageQuery`).
  readonly status: TicketStatus | "";
  readonly statusesFromDeepLink?: readonly TicketStatus[];
  readonly priority: TicketPriority | "";
  readonly serviceId: string;
  readonly assignedUserId: string;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly overdue: boolean;
  /** Val 6.1 / modul 4 (D1): at-risk (not yet breached) tickets deep-linked from a card. */
  readonly atRisk?: boolean;
  /** Package 1.6, staff only. */
  readonly forwarded?: TicketForwardedFilter;
  /** , staff only: tickets I follow / where I was mentioned. */
  readonly personal?: TicketPersonalFilter;
  /** Package 1.2 hide merged children (staff default: on). */
  readonly hideMerged?: boolean;
  /** , staff only: unrouted past the cleanup deadline. */
  readonly unroutedOverdue?: boolean;
  /**
   * Package 5.2.3 active inbox sub-tab. `unrouted` is the unrouted
   * queue; any other value is a group id. One field, serialized to the URL,
   * drives what the inbox displays, what page the unrouted pager is on and
   * what count pills show — no separate local useState that drifts from the
   * filter/URL/counter state on reload.
   */
  readonly inboxTab?: string;
  readonly currentUserId: string | null;
};

export type TicketForwardedFilter = "" | "any" | "toMyGroups";

export type TicketPersonalFilter = "" | "following" | "mentionedMe";

export function parsePersonalFilter(value: string | null): TicketPersonalFilter {
  return value === "following" || value === "mentionedMe" ? value : "";
}

export function parseForwardedFilter(value: string | null): TicketForwardedFilter {
  return value === "any" || value === "toMyGroups" ? value : "";
}

/**
 * Val 6.1 / modul 4 (D1): a card or shareable link may send one or more
 * `status=` params (repeated keys). Returns the single status to put into
 * filter state (used by filter controls — a single-status chip stays visible),
 * plus any additional statuses that should be forwarded to the server query
 * only. When the URL has a single status we return it in `status`; when it
 * repeats, the first one drives the chip and the rest travel alongside via
 * `additional` so the server still filters by every status in the link.
 */
export function parseStatusFilter(
  values: readonly string[] | null,
  allowed: ReadonlySet<TicketStatus>,
): { readonly status: TicketStatus | ""; readonly additional: readonly TicketStatus[] } {
  if (values === null || values.length === 0) {
    return { status: "", additional: [] };
  }
  const parsed = values.filter((value): value is TicketStatus =>
    allowed.has(value as TicketStatus),
  );
  if (parsed.length === 0) {
    return { status: "", additional: [] };
  }
  const [first, ...rest] = parsed;
  return { status: first, additional: rest };
}

export function parsePriorityFilter(value: string | null): TicketPriority | "" {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL"
    ? value
    : "";
}

export function parseBooleanFlag(value: string | null): boolean {
  return value === "true";
}

export function isTicketOverdue(ticket: Pick<TicketResponse, "isOverdue">): boolean {
  return ticket.isOverdue === true;
}

export function matchesTicketSearch(ticket: TicketResponse, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return true;
  }
  return (
    ticket.ticketNumber.toLowerCase().includes(query) ||
    ticket.title.toLowerCase().includes(query) ||
    ticket.description.toLowerCase().includes(query)
  );
}

export function matchesTicketView(
  ticket: TicketResponse,
  view: TicketWorkspaceView,
  currentUserId: string | null,
): boolean {
  if (view === "all" || view === "inbox") {
    return true;
  }
  if (view === "assigned") {
    return currentUserId !== null && ticket.assignedUserId === currentUserId;
  }
  if (view === "requested") {
    return currentUserId !== null && ticket.requesterId === currentUserId;
  }
  return ticket.assignedUserId === null;
}

// M8 B4: staff lists hide merged children by default. The requester-facing
// "my tickets" / portal lists have no merged children at all, so the flag is
// simply true for staff.
export function defaultHideMerged(isStaff: boolean): boolean {
  return isStaff;
}

// M8 B6: the default inbox sub-tab when nothing is in the URL — unrouted queue
// first so an empty handler-group inbox still shows the meaningful queue.
export const defaultInboxTab = unroutedInboxTabKey;

export function hasActiveTicketFilters(filters: TicketListFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== "" ||
    filters.priority !== "" ||
    filters.serviceId !== "" ||
    filters.assignedUserId !== "" ||
    filters.createdFrom !== "" ||
    filters.createdTo !== "" ||
    filters.overdue ||
    (filters.forwarded !== undefined && filters.forwarded !== "") ||
    (filters.personal !== undefined && filters.personal !== "") ||
    filters.unroutedOverdue === true
  );
}

export function clearedTicketListFilters(
  filters: TicketListFilters,
  isStaff: boolean,
): TicketListFilters {
  return {
    ...filters,
    search: "",
    status: "",
    statusesFromDeepLink: [],
    priority: "",
    serviceId: "",
    assignedUserId: "",
    createdFrom: "",
    createdTo: "",
    overdue: false,
    atRisk: false,
    forwarded: "",
    personal: "",
    unroutedOverdue: false,
    hideMerged: defaultHideMerged(isStaff),
    // Inbox tab is reset on Clear only when we're looking at the inbox; on
    // other views it stays untouched (it's meaningless there but harmless to
    // keep in the URL for when the user navigates back).
    inboxTab: filters.view === "inbox" ? defaultInboxTab : filters.inboxTab,
  };
}

export function filterTickets(
  tickets: readonly TicketResponse[],
  filters: TicketListFilters,
): readonly TicketResponse[] {
  const statuses: readonly TicketStatus[] = [
    ...(filters.status === "" ? [] : [filters.status]),
    ...(filters.statusesFromDeepLink ?? []),
  ];
  return tickets.filter((ticket) => {
    if (!matchesTicketSearch(ticket, filters.search)) {
      return false;
    }
    if (statuses.length > 0 && !statuses.includes(ticket.status)) {
      return false;
    }
    if (filters.priority !== "" && ticket.priority !== filters.priority) {
      return false;
    }
    if (filters.overdue && !isTicketOverdue(ticket)) {
      return false;
    }
    if (filters.atRisk === true && ticket.isAtRisk !== true) {
      return false;
    }
    if (filters.serviceId !== "" && ticket.serviceId !== filters.serviceId) {
      return false;
    }
    if (filters.assignedUserId !== "" && ticket.assignedUserId !== filters.assignedUserId) {
      return false;
    }
    if (filters.createdFrom !== "" && ticket.createdAt < filters.createdFrom) {
      return false;
    }
    if (filters.createdTo !== "" && ticket.createdAt > filters.createdTo) {
      return false;
    }
    return matchesTicketView(ticket, filters.view, filters.currentUserId);
  });
}
