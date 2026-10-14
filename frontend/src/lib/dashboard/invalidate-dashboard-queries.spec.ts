import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDashboardQueries } from "@/lib/dashboard/invalidate-dashboard-queries";

describe("invalidateDashboardQueries", () => {
  it("invalidates every dashboard source, including the inbox snapshot counts", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateDashboardQueries({ invalidateQueries } as unknown as QueryClient);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      queryKeys.dashboardSummaryPrefix,
      queryKeys.ticketLists,
      queryKeys.ticketCountsPrefix,
      queryKeys.groupInbox,
    ]);
  });
});
