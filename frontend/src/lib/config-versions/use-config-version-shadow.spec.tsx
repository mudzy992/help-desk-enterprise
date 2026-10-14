// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConfigVersionShadow } from "@/lib/config-versions/use-config-version-shadow";
import { shadowConfigVersion, type ConfigShadowDiff } from "@/services/config-versions-api";

vi.mock("@/services/config-versions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/config-versions-api")>();
  return { ...actual, shadowConfigVersion: vi.fn() };
});

describe("useConfigVersionShadow", () => {
  it("drops an answer after the selected version is cleared", async () => {
    let resolve!: (value: ConfigShadowDiff) => void;
    vi.mocked(shadowConfigVersion).mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = renderHook(() => useConfigVersionShadow());
    let request!: Promise<void>;
    act(() => {
      request = result.current.run("version-a", vi.fn());
    });
    act(() => result.current.clear());
    await act(async () => {
      resolve({ sampleSize: 4, routingGroupMismatches: 1, slaRuleMismatches: 2 });
      await request;
    });
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
