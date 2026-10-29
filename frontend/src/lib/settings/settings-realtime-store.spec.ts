import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bumpSettingsGeneration,
  getSettingsGeneration,
  resetSettingsRealtimeStoreForTests,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";

describe("settings realtime store lifecycle", () => {
  beforeEach(resetSettingsRealtimeStoreForTests);

  it("resets generation and removes stale listeners", () => {
    const listener = vi.fn();
    subscribeSettingsGeneration(listener);
    bumpSettingsGeneration();
    expect(getSettingsGeneration()).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
    resetSettingsRealtimeStoreForTests();
    bumpSettingsGeneration();
    expect(getSettingsGeneration()).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
  });
});
