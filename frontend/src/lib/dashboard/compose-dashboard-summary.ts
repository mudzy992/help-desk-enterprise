import type { DashboardVolumeDay } from "@/services/report-summary-api";
import { selectAttentionTickets, selectSlaWatchlist } from "@/lib/dashboard/dashboard-ticket-sets";
import type { DashboardSummaryCounts } from "@/services/report-summary-api";
import type { TicketResponse } from "@/services/tickets-api";

export const dashboardRecentTicketLimit = 8;

/**
 * What the dashboard renders: the server counters () plus the small
 * presentation slices.
 *
 * Val 1 the slices no longer come from „the first page of 50 tickets“
 * — that page was sorted by creation date, so an overdue or critical ticket
 * outside it silently disappeared from the watch/attention lists. Every list now
 * has its own **server-filtered, small query** (`recent`, `overdue`,
 * `assignedToMe`, `unassigned`), and the chart is counted in the browser only
 * over the tickets it was given.
 */
export type DashboardSummary = DashboardSummaryCounts & {
  readonly volume14d: readonly DashboardVolumeDay[];
  readonly recent: readonly TicketResponse[];
  readonly slaWatchlist: readonly TicketResponse[];
  readonly attention: readonly TicketResponse[];
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
  readonly currentUserId: string | null;
}): DashboardSummary {
  return {
    ...input.counts,
    recent: [...input.recentTickets]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, dashboardRecentTicketLimit),
    slaWatchlist: selectSlaWatchlist(input.overdueTickets),
    attention: selectAttentionTickets(
      [...input.assignedToMeTickets, ...input.unassignedTickets],
      input.currentUserId,
    ),
  };
}
