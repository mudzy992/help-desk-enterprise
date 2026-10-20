// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { ApiError } from "@/services/api";
import { listGroups } from "@/services/groups-api";
import { listServices } from "@/services/service-catalog-api";

vi.mock("@/services/groups-api", () => ({ listGroups: vi.fn() }));
vi.mock("@/services/service-catalog-api", () => ({ listServices: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listServices).mockResolvedValue([{ id: "s1", name: "Service" }] as never);
  vi.mocked(listGroups).mockResolvedValue([{ id: "g1", name: "Group" }] as never);
});

describe("useReportFilterOptions", () => {
  it("does not load before a filter-dependent tab is active", () => {
    const { result } = renderHook(() => useReportFilterOptions(false, "en"));
    expect(result.current.services).toEqual([]);
    expect(listServices).not.toHaveBeenCalled();
  });

  it("distinguishes one failed catalog and keeps the successful options", async () => {
    vi.mocked(listGroups).mockRejectedValue(
      new ApiError(503, "UNAVAILABLE", "failed", "req-groups"),
    );
    const { result } = renderHook(() => useReportFilterOptions(true, "en"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.services).toEqual([{ id: "s1", label: "Service" }]);
    expect(result.current.groupError).toEqual({
      key: "errors.setupRequired",
      requestId: "req-groups",
    });
  });

  it("retains a successful snapshot during an error and recovers on retry", async () => {
    const { result } = renderHook(() => useReportFilterOptions(true, "en"));
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    vi.mocked(listGroups)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-refresh"))
      .mockResolvedValueOnce([{ id: "g2", name: "Recovered" }] as never);

    await act(async () => result.current.load());
    expect(result.current.groups).toEqual([{ id: "g1", label: "Group" }]);
    expect(result.current.groupError?.requestId).toBe("req-refresh");
    await act(async () => result.current.load());
    expect(result.current.groupError).toBeNull();
    expect(result.current.groups).toEqual([{ id: "g2", label: "Recovered" }]);
  });
});
