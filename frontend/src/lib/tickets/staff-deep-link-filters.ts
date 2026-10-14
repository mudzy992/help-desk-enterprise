import type { TicketStatus } from "@/services/tickets-api";
import {
  parseBooleanFlag,
  parseForwardedFilter,
  parsePersonalFilter,
  parsePriorityFilter,
  parseStatusFilter,
  type TicketListFilters,
} from "@/lib/tickets/filter-tickets";

const deepLinkStatuses: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "PENDING",
  "UNROUTED",
  "PENDING_APPROVAL",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
  "ARCHIVED",
]);

/**
 * Staff-only filters that may arrive through a shareable URL (deep links).
 *
 * Val 6.1 / modul 4 (D1): dashboard metric cards (Kritični, Nerutirani,
 * Prekoračeni, Čeka korisnika, Čeka odobrenje) and SLA / attention "All" links
 * now carry `status`, `priority`, `overdue`, `atRisk` in the URL. Without
 * reading those, a click on a card landed the user on an unfiltered list,
 * which broke the promise of the metric.
 */
export function staffDeepLinkFilters(
  searchParams: URLSearchParams,
  isStaff: boolean,
): Pick<
  TicketListFilters,
  | "forwarded"
  | "personal"
  | "hideMerged"
  | "unroutedOverdue"
  | "inboxTab"
  | "status"
  | "statusesFromDeepLink"
  | "priority"
  | "overdue"
  | "atRisk"
> {
  const rawTab = searchParams.get("inboxTab");
  if (!isStaff) {
    return {
      forwarded: "",
      personal: "",
      hideMerged: false,
      unroutedOverdue: false,
      inboxTab: undefined,
      status: "",
      statusesFromDeepLink: [],
      priority: "",
      overdue: false,
      atRisk: false,
    };
  }
  const parsedStatus = parseStatusFilter(searchParams.getAll("status"), deepLinkStatuses);
  return {
    // Package 1.6: `/tickets?forwarded=toMyGroups` is a shareable deep link.
    forwarded: parseForwardedFilter(searchParams.get("forwarded")),
    // Paket 2.4: `/tickets?personal=mentionedMe` (notification deep link).
    personal: parsePersonalFilter(searchParams.get("personal")),
    // Package 1.2 (M7): staff lists hide merged children unless asked.
    hideMerged: searchParams.get("hideMerged") !== "false",
    // Paket 1.7 (U3): deep link from the dashboard and the weekly digest.
    unroutedOverdue: parseBooleanFlag(searchParams.get("unroutedOverdue")),
    // Package 5.2.3 (M8 B6): preserve the inbox sub-tab across reloads when
    // explicitly set in the URL. Defaulting is handled by use-ticket-list so
    // non-inbox views are not polluted with an "unrouted" tab value.
    inboxTab: rawTab !== null && rawTab.trim().length > 0 ? rawTab.trim() : undefined,
    // Val 6.1 / modul 4 (D1): card deep links — the first status populates
    // the filter chip; additional repeated `status=` keys are forwarded to
    // the server alongside it without changing the UI (multi-status deep
    // links are a share/link feature, not a UI control yet).
    status: parsedStatus.status,
    statusesFromDeepLink: parsedStatus.additional,
    priority: parsePriorityFilter(searchParams.get("priority")),
    overdue: parseBooleanFlag(searchParams.get("overdue")),
    atRisk: parseBooleanFlag(searchParams.get("atRisk")),
  };
}
