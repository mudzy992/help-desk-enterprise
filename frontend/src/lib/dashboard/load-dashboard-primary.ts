import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { composeDashboardSummary, dashboardRecentTicketLimit, type DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";
import { dashboardAttentionTicketLimit, dashboardOpenStatuses, dashboardSlaWatchlistLimit } from "@/lib/dashboard/dashboard-ticket-sets";
import { dashboardVolumeDayCount } from "@/lib/dashboard/build-volume-14d";
import { loadDashboardVolume } from "@/lib/dashboard/load-dashboard-volume";
import { fetchDashboardSummary } from "@/services/report-summary-api";
import { listTicketsPage, type TicketResponse } from "@/services/tickets-api";

function dashboardVolumeWindowStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dashboardVolumeDayCount - 1));
}

export async function loadDashboardPrimary(input: {
  readonly queryClient: QueryClient;
  readonly dayKey: string;
  readonly currentUserId: string | null;
  readonly isStaff: boolean;
}): Promise<DashboardSummary> {
  const { queryClient, dayKey, currentUserId, isStaff } = input;
const volumeStart = dashboardVolumeWindowStart(new Date());
const volumeLoadPromise = loadDashboardVolume({
  fetchPage: (page, pageSize) =>
    queryClient.fetchQuery({
      // Val 6.1 / modul 4 (D18): include the window start in the query
      // key so results from different windows never collide; the old
      // key relied on staleTime expiring fast enough.
      queryKey: queryKeys.ticketList({
        view: "dashboard-volume",
        windowFrom: volumeStart.toISOString(),
        page,
      }),
      queryFn: () =>
        listTicketsPage({
          createdFrom: volumeStart.toISOString(),
          sort: "createdAt",
          dir: "desc",
          page,
          pageSize,
        }),
    }),
});
const [
  counts,
  recentPage,
  overduePage,
  minePage,
  unassignedPage,
  criticalUnassignedPage,
  volumeLoad,
] = await Promise.all([
  queryClient.fetchQuery({
    queryKey: queryKeys.dashboardSummary(dayKey),
    queryFn: () => fetchDashboardSummary(),
  }),
  queryClient.fetchQuery({
    queryKey: queryKeys.ticketList({ view: "dashboard-recent" }),
    queryFn: () =>
      listTicketsPage({
        sort: "createdAt",
        dir: "desc",
        pageSize: dashboardRecentTicketLimit,
      }),
  }),
  queryClient.fetchQuery({
    queryKey: queryKeys.ticketList({ view: "dashboard-overdue" }),
    queryFn: () =>
      listTicketsPage({
        overdue: true,
        sort: "slaDueAt",
        dir: "asc",
        pageSize: dashboardSlaWatchlistLimit,
      }),
  }),
  currentUserId === null
    ? Promise.resolve(null)
    : queryClient.fetchQuery({
        queryKey: queryKeys.ticketList({
          view: "dashboard-assigned",
          userId: currentUserId,
        }),
        queryFn: () =>
          listTicketsPage({
            assignedUserId: currentUserId,
            status: [...dashboardOpenStatuses],
            sort: "updatedAt",
            dir: "desc",
            pageSize: dashboardAttentionTicketLimit,
          }),
      }),
  queryClient.fetchQuery({
    queryKey: queryKeys.ticketList({ view: "dashboard-unassigned" }),
    queryFn: () =>
      listTicketsPage({
        unassigned: true,
        status: [...dashboardOpenStatuses],
        sort: "updatedAt",
        dir: "desc",
        pageSize: dashboardAttentionTicketLimit,
      }),
  }),
  isStaff
    ? queryClient.fetchQuery({
        queryKey: queryKeys.ticketList({ view: "dashboard-critical-unassigned" }),
        queryFn: () =>
          listTicketsPage({
            unassigned: true,
            priority: "CRITICAL",
            status: [...dashboardOpenStatuses],
            sort: "slaDueAt",
            dir: "asc",
            pageSize: dashboardAttentionTicketLimit,
          }),
      })
    : Promise.resolve({ items: [] as readonly TicketResponse[] }),
  volumeLoadPromise,
]);

return composeDashboardSummary({
    counts,
    recentTickets: recentPage.items,
    overdueTickets: overduePage.items,
    assignedToMeTickets: minePage?.items ?? [],
    unassignedTickets: [...unassignedPage.items, ...criticalUnassignedPage.items],
    volumeTickets: volumeLoad.tickets,
    volumeTruncated: volumeLoad.truncated,
    currentUserId,
});
}
