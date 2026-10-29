// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import type { StatusPageOverview } from "@/services/status-api";
import { useStatusOverviewData } from "./use-status-overview-data";

const api = vi.hoisted(() => ({ getStatusOverview: vi.fn() }));
vi.mock("@/services/status-api", () => api);

function overview(id: string): StatusPageOverview {
  return {
    generatedAt: id,
    configuration: { enabled: true, public: false, historyDays: 30, showUptimePercent: true },
    canManage: true,
    affectedServiceCount: 0,
    servicesHasMore: false,
    plannedHasMore: false,
    categories: [],
    activeIncidents: [],
    planned: [],
    history: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useStatusOverviewData", () => {
  beforeEach(() => {
    vi.useRealTimers();
    api.getStatusOverview.mockReset().mockResolvedValue(overview("initial"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("retains stale data and exposes the domain error with request correlation", async () => {
    const { result } = renderHook(() => useStatusOverviewData());
    await waitFor(() => expect(result.current.overview?.generatedAt).toBe("initial"));

    api.getStatusOverview.mockRejectedValueOnce(
      new ApiError(503, "STATUS_PAGE_DISABLED", "disabled", "req-status"),
    );
    await act(async () => expect(await result.current.reload()).toBe("error"));

    expect(result.current.overview?.generatedAt).toBe("initial");
    expect(result.current.error).toEqual({
      key: "status.errors.disabled",
      requestId: "req-status",
      disabled: true,
    });
  });

  it("commits only the latest overlapping request", async () => {
    const older = deferred<StatusPageOverview>();
    const newer = deferred<StatusPageOverview>();
    api.getStatusOverview
      .mockResolvedValueOnce(overview("initial"))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useStatusOverviewData());
    await waitFor(() => expect(result.current.overview?.generatedAt).toBe("initial"));

    let olderResult!: Promise<string>;
    let newerResult!: Promise<string>;
    act(() => {
      olderResult = result.current.reload();
      newerResult = result.current.reload();
    });
    await act(async () => newer.resolve(overview("newer")));
    expect(await newerResult).toBe("applied");
    await act(async () => older.resolve(overview("older")));
    expect(await olderResult).toBe("stale");
    expect(result.current.overview?.generatedAt).toBe("newer");
  });

  it("polls only while the document is visible", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    renderHook(() => useStatusOverviewData());
    await act(async () => Promise.resolve());
    expect(api.getStatusOverview).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(api.getStatusOverview).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(api.getStatusOverview).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("cancels a pending request on unmount", async () => {
    const pending = deferred<StatusPageOverview>();
    api.getStatusOverview.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useStatusOverviewData());
    unmount();
    pending.resolve(overview("late"));
    await act(async () => Promise.resolve());
    expect(result.current.overview).toBeNull();
  });
});
