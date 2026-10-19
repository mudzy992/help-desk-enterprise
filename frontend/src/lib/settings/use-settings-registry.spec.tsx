// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { createHelpdeskQueryClient } from "@/lib/query/query-client";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { getSettingsRegistry, updateSetting, updateSettings } from "@/services/settings-api";

vi.mock("@/services/settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settings-api")>();
  return {
    ...actual,
    getSettingsRegistry: vi.fn(),
    updateSetting: vi.fn(),
    updateSettings: vi.fn(),
  };
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

describe("useSettingsRegistry", () => {
  let queryClient: ReturnType<typeof createHelpdeskQueryClient>;
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createHelpdeskQueryClient();
    vi.mocked(getSettingsRegistry).mockReset();
    vi.mocked(getSettingsRegistry).mockResolvedValue([]);
    vi.mocked(updateSetting).mockResolvedValue({ updatedKeys: ["a"], resetDependents: [] });
    vi.mocked(updateSettings).mockResolvedValue({ updatedKeys: ["a", "b"], resetDependents: [] });
  });

  it("performs one registry refetch after a save", async () => {
    const { result } = renderHook(() => useSettingsRegistry(), { wrapper });
    await waitFor(() => expect(getSettingsRegistry).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.save({ key: "a", value: true, reason: "test" });
    });
    await waitFor(() => expect(getSettingsRegistry).toHaveBeenCalledTimes(2));
  });

  it("marks every batch key pending", async () => {
    const write = deferred<{ updatedKeys: string[]; resetDependents: [] }>();
    vi.mocked(updateSettings).mockReturnValue(write.promise);
    const { result } = renderHook(() => useSettingsRegistry(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = result.current.saveMany({
        entries: [
          { key: "a", value: true },
          { key: "b", value: false },
        ],
        reason: "batch",
      });
    });
    expect([...result.current.pendingKeys]).toEqual(["a", "b"]);
    await act(async () => {
      write.resolve({ updatedKeys: ["a", "b"], resetDependents: [] });
      await savePromise;
    });
    expect([...result.current.pendingKeys]).toEqual([]);
  });

  it("keeps an overlapping key pending until its last operation finishes", async () => {
    const single = deferred<{ updatedKeys: string[]; resetDependents: [] }>();
    const batch = deferred<{ updatedKeys: string[]; resetDependents: [] }>();
    vi.mocked(updateSetting).mockReturnValue(single.promise);
    vi.mocked(updateSettings).mockReturnValue(batch.promise);
    const { result } = renderHook(() => useSettingsRegistry(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let singleSave!: Promise<unknown>;
    let batchSave!: Promise<unknown>;
    act(() => {
      singleSave = result.current.save({ key: "a", value: true, reason: "single" });
      batchSave = result.current.saveMany({
        entries: [
          { key: "a", value: false },
          { key: "b", value: true },
        ],
        reason: "batch",
      });
    });
    expect([...result.current.pendingKeys]).toEqual(["a", "b"]);

    await act(async () => {
      single.resolve({ updatedKeys: ["a"], resetDependents: [] });
      await singleSave;
    });
    expect([...result.current.pendingKeys]).toEqual(["a", "b"]);

    await act(async () => {
      batch.resolve({ updatedKeys: ["a", "b"], resetDependents: [] });
      await batchSave;
    });
    expect([...result.current.pendingKeys]).toEqual([]);
  });

  it("removes only failed operation counts and exposes its request id", async () => {
    const first = deferred<{ updatedKeys: string[]; resetDependents: [] }>();
    const second = deferred<{ updatedKeys: string[]; resetDependents: [] }>();
    vi.mocked(updateSetting).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useSettingsRegistry(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let failedSave!: Promise<unknown>;
    let activeSave!: Promise<unknown>;
    act(() => {
      failedSave = result.current.save({ key: "a", value: true, reason: "first" });
      activeSave = result.current.save({ key: "a", value: false, reason: "second" });
    });
    await act(async () => {
      first.reject(new ApiError(500, "FAILED", "failed", "write-request"));
      await expect(failedSave).rejects.toThrow("failed");
    });
    expect([...result.current.pendingKeys]).toEqual(["a"]);
    expect(result.current.requestId).toBe("write-request");

    await act(async () => {
      second.resolve({ updatedKeys: ["a"], resetDependents: [] });
      await activeSave;
    });
    expect([...result.current.pendingKeys]).toEqual([]);
  });

  it("retains registry data and exposes refresh errors with request ids", async () => {
    vi.mocked(getSettingsRegistry)
      .mockResolvedValueOnce([{ key: "existing" } as never])
      .mockRejectedValue(new ApiError(503, "UNAVAILABLE", "offline", "read-request"));
    const { result } = renderHook(() => useSettingsRegistry(), { wrapper });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.errorKey).not.toBeNull();
    expect(result.current.requestId).toBe("read-request");
  });
});
