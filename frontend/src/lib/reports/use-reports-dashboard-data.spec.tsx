// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useReportsDashboardData } from "@/lib/reports/use-reports-dashboard-data";
import { fetchReportsDashboard } from "@/services/reports-api";

vi.mock("@/services/reports-api", () => ({ fetchReportsDashboard: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("loads only while active and binds the request to the current scope", async () => {
  vi.mocked(fetchReportsDashboard).mockResolvedValue({ ticketCount: 1 } as never);
  const { result, rerender } = renderHook(
    ({ active, unit }) =>
      useReportsDashboardData({
        active,
        organizationalUnitId: unit,
        from: "2026-01-01T00:00:00Z",
        to: "2026-02-01T00:00:00Z",
      }),
    { initialProps: { active: false, unit: "ou-1" } },
  );
  expect(fetchReportsDashboard).not.toHaveBeenCalled();
  rerender({ active: true, unit: "ou-2" });
  await waitFor(() => expect(result.current.dashboard?.ticketCount).toBe(1));
  expect(fetchReportsDashboard).toHaveBeenCalledWith(
    expect.objectContaining({ organizationalUnitId: "ou-2" }),
  );
});

it("does not commit an older scope response", async () => {
  let releaseFirst!: (value: never) => void;
  vi.mocked(fetchReportsDashboard)
    .mockReturnValueOnce(new Promise((resolve) => (releaseFirst = resolve)))
    .mockResolvedValueOnce({ ticketCount: 2 } as never);
  const { result, rerender } = renderHook(
    ({ unit }) =>
      useReportsDashboardData({ active: true, organizationalUnitId: unit, from: "from", to: "to" }),
    { initialProps: { unit: "ou-1" } },
  );
  rerender({ unit: "ou-2" });
  await waitFor(() => expect(result.current.dashboard?.ticketCount).toBe(2));
  await act(async () => releaseFirst({ ticketCount: 1 } as never));
  expect(result.current.dashboard?.ticketCount).toBe(2);
});
