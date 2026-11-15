import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { invalidateDashboardQueries } from "@/lib/dashboard/invalidate-dashboard-queries";
import { queryKeys } from "@/lib/query/query-keys";

it("does not reuse a pending pre-event query for the catch-up read", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (value: string) => void;
  const old = new Promise<string>((resolve) => {
    resolveOld = resolve;
  });
  const queryKey = queryKeys.dashboardSummary("2026-01-01");
  const queryFn = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce("fresh");
  const first = client.fetchQuery({ queryKey, queryFn }).catch(() => null);

  await invalidateDashboardQueries(client);
  expect(await client.fetchQuery({ queryKey, queryFn })).toBe("fresh");
  resolveOld("stale");
  await first;
  expect(client.getQueryData(queryKey)).toBe("fresh");
  expect(queryFn).toHaveBeenCalledTimes(2);
  client.clear();
});

it("invalidates every dashboard source, including inbox counts", async () => {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  const cancelQueries = vi.fn().mockResolvedValue(undefined);
  await invalidateDashboardQueries({ invalidateQueries, cancelQueries } as unknown as QueryClient);
  const keys = [
    queryKeys.dashboardSummaryPrefix,
    queryKeys.ticketLists,
    queryKeys.ticketCountsPrefix,
    queryKeys.groupInbox,
  ];
  expect(cancelQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual(keys);
  expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual(keys);
});
