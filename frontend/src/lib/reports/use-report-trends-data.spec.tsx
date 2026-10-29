// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useReportTrendsData } from "@/lib/reports/use-report-trends-data";
import { fetchReportTrends } from "@/services/report-trends-api";
import { ApiError } from "@/services/api";

vi.mock("@/services/report-trends-api", async (original) => ({
  ...(await original<typeof import("@/services/report-trends-api")>()),
  fetchReportTrends: vi.fn(),
}));

const state = {
  preset: "custom" as const,
  from: "2026-01-01",
  to: "2026-01-31",
  granularity: null,
  organizationalUnitId: null,
  serviceId: null,
  groupId: null,
  priority: null,
};

beforeEach(() => vi.clearAllMocks());

it("exposes request-correlated errors and recovers on a new query", async () => {
  vi.mocked(fetchReportTrends)
    .mockRejectedValueOnce(new ApiError(503, "FAILED", "failed", "req-trends"))
    .mockResolvedValueOnce({ points: [] } as never);
  const { result, rerender } = renderHook(({ unit }) => useReportTrendsData(state, unit), {
    initialProps: { unit: "ou-1" },
  });
  await waitFor(() => expect(result.current.error?.requestId).toBe("req-trends"));
  rerender({ unit: "ou-2" });
  await waitFor(() => expect(result.current.trends).not.toBeNull());
  expect(result.current.error).toBeNull();
  expect(fetchReportTrends).toHaveBeenLastCalledWith(
    expect.objectContaining({ organizationalUnitId: "ou-2" }),
  );
});
