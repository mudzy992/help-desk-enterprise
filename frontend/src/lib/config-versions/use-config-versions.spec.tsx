// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConfigVersions } from "@/lib/config-versions/use-config-versions";
import { ApiError } from "@/services/api";
import { listConfigVersions, type ConfigVersion } from "@/services/config-versions-api";

vi.mock("@/services/config-versions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/config-versions-api")>();
  return { ...actual, listConfigVersions: vi.fn() };
});

const version = (id: string, versionNumber: number): ConfigVersion => ({
  id,
  version: versionNumber,
  status: "ACTIVE",
  releaseNotes: null,
  createdByUserId: null,
  activatedAt: null,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  rollbackOfVersion: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useConfigVersions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retains the last successful snapshot when a refresh fails", async () => {
    vi.mocked(listConfigVersions)
      .mockResolvedValueOnce([version("v1", 1)])
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "offline", "request-7"));
    const { result } = renderHook(() => useConfigVersions(true));

    await waitFor(() => expect(result.current.versions).toHaveLength(1));
    await act(async () => {
      await result.current.load();
    });

    expect(result.current.versions.map(({ id }) => id)).toEqual(["v1"]);
    expect(result.current.errorKey).not.toBeNull();
    expect(result.current.requestId).toBe("request-7");
    expect(result.current.isRefreshing).toBe(false);
  });

  it("allows only the latest overlapping request to update the snapshot and loading state", async () => {
    const first = deferred<readonly ConfigVersion[]>();
    const second = deferred<readonly ConfigVersion[]>();
    vi.mocked(listConfigVersions)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useConfigVersions(true));

    let latest!: Promise<void>;
    act(() => {
      latest = result.current.load();
    });
    await act(async () => {
      second.resolve([version("latest", 2)]);
      await latest;
    });
    expect(result.current.versions.map(({ id }) => id)).toEqual(["latest"]);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      first.resolve([version("stale", 1)]);
      await first.promise;
    });
    expect(result.current.versions.map(({ id }) => id)).toEqual(["latest"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("invalidates an in-flight request when the hook is disabled", async () => {
    const pending = deferred<readonly ConfigVersion[]>();
    vi.mocked(listConfigVersions).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => useConfigVersions(enabled), {
      initialProps: { enabled: true },
    });

    rerender({ enabled: false });
    expect(result.current.versions).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      pending.resolve([version("stale", 1)]);
      await pending.promise;
    });
    expect(result.current.versions).toEqual([]);
  });
});
