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
 * presentation slices that still come from one page of tickets.
 *
 * The counters used to be derived here from the same page, which made every
 * number wrong as soon as a user had more tickets than a page — and made the
 * browser do the counting. `GET /reports/dashboard/summary` answers them with
 * SQL over the same visibility scope now; only the recent list, the SLA watch
 * list, the attention list and the 14-day chart remain view data.
 */
export type DashboardSummary = DashboardSummaryCounts & {
  readonly volume14d: readonly TicketVolumeDay[];
  readonly recent: readonly TicketResponse[];
  readonly slaWatchlist: readonly TicketResponse[];
  readonly attention: readonly TicketResponse[];
};

export function composeDashboardSummary(input: {
  readonly counts: DashboardSummaryCounts;
  readonly tickets: readonly TicketResponse[];
  readonly currentUserId: string | null;
  readonly now?: Date;
}): DashboardSummary {
  const now = input.now ?? new Date();
  return {
    ...input.counts,
    volume14d: buildVolume14d(input.tickets, now),
    recent: [...input.tickets]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, dashboardRecentTicketLimit),
    slaWatchlist: selectSlaWatchlist(input.tickets),
    attention: selectAttentionTickets(input.tickets, input.currentUserId),
  };
}
