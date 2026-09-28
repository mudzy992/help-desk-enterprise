import {
  parseForwardedFilter,
  parsePersonalFilter,
  type TicketListFilters,
} from "@/lib/tickets/filter-tickets";

/** Staff-only filters that may arrive through a shareable URL (deep links). */
export function staffDeepLinkFilters(
  searchParams: URLSearchParams,
  isStaff: boolean,
): Pick<TicketListFilters, "forwarded" | "personal" | "hideMerged" | "unroutedOverdue"> {
  return {
    // Package 1.6: `/tickets?forwarded=toMyGroups` is a shareable deep link.
    forwarded: isStaff ? parseForwardedFilter(searchParams.get("forwarded")) : "",
    // Paket 2.4: `/tickets?personal=mentionedMe` (notification deep link).
    personal: isStaff ? parsePersonalFilter(searchParams.get("personal")) : "",
    // Package 1.2 (M7): staff lists hide merged children unless asked.
    hideMerged: isStaff && searchParams.get("hideMerged") !== "false",
    // Paket 1.7 (U3): deep link from the dashboard and the weekly digest.
    unroutedOverdue: isStaff && searchParams.get("unroutedOverdue") === "true",
  };
}
