// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    let resolveWrite!: (value: { updatedKeys: string[]; resetDependents: [] }) => void;
    vi.mocked(updateSettings).mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
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
      resolveWrite({ updatedKeys: ["a", "b"], resetDependents: [] });
      await savePromise;
    });
  });
});
