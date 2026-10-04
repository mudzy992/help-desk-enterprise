import {
  buildVolume14d,
  type TicketVolumeDay,
} from "@/lib/dashboard/build-volume-14d";
import {
  selectAttentionTickets,
  selectSlaWatchlist,
} from "@/lib/dashboard/dashboard-ticket-sets";
import type { DashboardSummaryCounts } from "@/services/report-summary-api";
import type { TicketResponse } from "@/services/tickets-api";

export const dashboardRecentTicketLimit = 8;

/**
 * What the dashboard renders: the server counters (phase 2.4) plus the small
 * presentation slices.
 *
 * Val 1 (M15/B6): the slices no longer come from „the first page of 50 tickets“
 * — that page was sorted by creation date, so an overdue or critical ticket
 * outside it silently disappeared from the watch/attention lists. Every list now
 * has its own **server-filtered, small query** (`recent`, `overdue`,
 * `assignedToMe`, `unassigned`), and the chart is counted in the browser only
 * over the tickets it was given.
 */
export type DashboardSummary = DashboardSummaryCounts & {
  readonly volume14d: readonly TicketVolumeDay[];
  readonly recent: readonly TicketResponse[];
  readonly slaWatchlist: readonly TicketResponse[];
  readonly attention: readonly TicketResponse[];
  /**
   * `true` when the chart window held more tickets than one page: the series is
   * then a lower bound and the UI says so instead of pretending it is exact.
   */
  readonly volumeTruncated: boolean;
};

export function composeDashboardSummary(input: {
  readonly counts: DashboardSummaryCounts;
  /** Server-sorted (newest first), one small page. */
  readonly recentTickets: readonly TicketResponse[];
  /** Server-filtered `overdue=true`, sorted by `updatedAt` descending. */
  readonly overdueTickets: readonly TicketResponse[];
  /** Server-filtered open tickets assigned to the caller. */
  readonly assignedToMeTickets: readonly TicketResponse[];
  /** Server-filtered open tickets without an assignee. */
  readonly unassignedTickets: readonly TicketResponse[];
  /**
   * Tickets created inside the chart window (`createdFrom`), used only to count
   * the 14-day series. Bounded by the page size the API allows; the subtitle
   * says so when the page is full.
   */
  readonly volumeTickets: readonly TicketResponse[];
  readonly volumeTruncated?: boolean;
  readonly currentUserId: string | null;
  readonly now?: Date;
}): DashboardSummary {
  const now = input.now ?? new Date();
  return {
    ...input.counts,
    volume14d: buildVolume14d(input.volumeTickets, now),
    recent: [...input.recentTickets]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, dashboardRecentTicketLimit),
    slaWatchlist: selectSlaWatchlist(input.overdueTickets),
    attention: selectAttentionTickets(
      [...input.assignedToMeTickets, ...input.unassignedTickets],
      input.currentUserId,
    ),
    volumeTruncated: input.volumeTruncated === true,
  };
}
