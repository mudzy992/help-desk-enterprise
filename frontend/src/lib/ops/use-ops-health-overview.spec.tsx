// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpsHealthOverview } from "@/lib/ops/use-ops-health-overview";
import { ApiError } from "@/services/api";
import { getOpsOverview, type OpsOverview } from "@/services/ops-health-api";

vi.mock("@/services/ops-health-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ops-health-api")>();
  return { ...actual, getOpsOverview: vi.fn() };
});

const overview = (generatedAt = "2026-10-19T00:00:00.000Z"): OpsOverview =>
  ({ generatedAt }) as OpsOverview;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useOpsHealthOverview", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("loads the initial overview and clears refreshing", async () => {
    vi.mocked(getOpsOverview).mockResolvedValue(overview());
    const { result } = renderHook(() => useOpsHealthOverview());
    await waitFor(() => expect(result.current.overview).not.toBeNull());
    expect(result.current.refreshing).toBe(false);
    expect(result.current.loadError).toBeNull();
  });

  it("retains the successful snapshot and exposes request id when refresh fails", async () => {
    vi.mocked(getOpsOverview)
      .mockResolvedValueOnce(overview("first"))
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "offline", "ops-request"));
    const { result } = renderHook(() => useOpsHealthOverview());
    await waitFor(() => expect(result.current.overview?.generatedAt).toBe("first"));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.overview?.generatedAt).toBe("first");
    expect(result.current.loadError?.requestId).toBe("ops-request");
  });

  it("coalesces overlapping refresh attempts", async () => {
    const pending = deferred<OpsOverview>();
    vi.mocked(getOpsOverview).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useOpsHealthOverview());
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    await act(async () => {
      await result.current.load();
    });
    expect(getOpsOverview).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(overview());
      await pending.promise;
    });
  });
});
