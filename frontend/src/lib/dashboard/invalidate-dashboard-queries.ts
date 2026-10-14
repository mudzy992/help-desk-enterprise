import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";

/**
 * Drop every cache read that contributes to dashboard metrics and snapshots
 * before a realtime-driven reload. Prefix matching covers all active filters.
 */
export async function invalidateDashboardQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummaryPrefix }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketCountsPrefix }),
    queryClient.invalidateQueries({ queryKey: queryKeys.groupInbox }),
  ]);
}
