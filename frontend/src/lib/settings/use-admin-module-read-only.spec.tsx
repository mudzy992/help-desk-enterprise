// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
import type { SettingRegistryEntry } from "@/services/settings-api";

const state = vi.hoisted(() => ({
  isLoading: false,
  errorKey: null as string | null,
  requestId: null as string | null,
  entries: [] as SettingRegistryEntry[],
  reload: vi.fn(),
}));

vi.mock("@/lib/settings/use-settings-registry", () => ({
  useSettingsRegistry: () => ({
    isLoading: state.isLoading,
    errorKey: state.errorKey,
    requestId: state.requestId,
    entries: state.entries,
    reload: state.reload,
  }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({ session: null }),
}));

const entry = (key: string, value: string | boolean): SettingRegistryEntry =>
  ({
    key,
    value,
    defaultValue: value,
    valueType: typeof value === "boolean" ? "boolean" : "string",
  }) as SettingRegistryEntry;

const lockedEntries = [
  entry("private.readOnlyMode.enabled", true),
  entry("private.readOnlyMode.modulesCsv", "admin,settings"),
  entry("private.readOnlyMode.activeModulesCsv", "settings"),
];

describe("useAdminModuleReadOnly", () => {
  beforeEach(() => {
    state.isLoading = false;
    state.errorKey = null;
    state.requestId = null;
    state.entries = [];
    state.reload.mockReset();
  });

  it("keeps writes disabled while policy is loading", () => {
    state.isLoading = true;
    const { result } = renderHook(() => useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings));
    expect(result.current.status).toBe("loading");
    expect(result.current.canWrite).toBe(false);
    expect(result.current.isLocked).toBe(false);
  });

  it("keeps writes disabled and exposes retry metadata when policy loading fails", async () => {
    state.errorKey = "errors.generic";
    state.requestId = "policy-request";
    const { result } = renderHook(() => useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings));
    expect(result.current.status).toBe("error");
    expect(result.current.canWrite).toBe(false);
    expect(result.current.requestId).toBe("policy-request");
    await result.current.retry();
    expect(state.reload).toHaveBeenCalledTimes(1);
  });

  it("distinguishes locked and unlocked resolved policies", () => {
    state.entries = lockedEntries;
    const locked = renderHook(() => useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings));
    expect(locked.result.current.status).toBe("locked");
    expect(locked.result.current.canWrite).toBe(false);
    locked.unmount();

    state.entries = [entry("private.readOnlyMode.enabled", false)];
    const unlocked = renderHook(() => useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings));
    expect(unlocked.result.current.status).toBe("unlocked");
    expect(unlocked.result.current.canWrite).toBe(true);
  });

  it("uses a stale successful policy during a background refresh error", () => {
    state.entries = [entry("private.readOnlyMode.enabled", false)];
    state.errorKey = "errors.generic";
    const { result } = renderHook(() => useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings));
    expect(result.current.status).toBe("unlocked");
    expect(result.current.canWrite).toBe(true);
    expect(result.current.errorKey).toBeNull();
  });
});
