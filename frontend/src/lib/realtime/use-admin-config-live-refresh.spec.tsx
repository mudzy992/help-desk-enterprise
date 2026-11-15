// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publishAdminConfigEvent,
  publishAdminConfigReconnect,
  type AdminConfigUpdatedEvent,
} from "./admin-config-events";
import { useAdminConfigLiveRefresh } from "./use-admin-config-live-refresh";

vi.mock("@/lib/session/use-session", () => ({ useSession: () => ({ currentUserId: "user-1" }) }));
afterEach(() => {
  cleanup();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

const event: AdminConfigUpdatedEvent = {
  domain: "templates",
  action: "update",
  actorUserId: "user-1",
  actorName: null,
  occurredAt: "2026-01-01T00:00:00.000Z",
};

describe("admin config live refresh", () => {
  it("surfaces a same-user change without replacing a potentially dirty editor", () => {
    const reload = vi.fn();
    const containerRef = { current: document.createElement("section") };
    const { result } = renderHook(() =>
      useAdminConfigLiveRefresh({ domains: ["templates"], reload, containerRef }),
    );
    act(() => publishAdminConfigEvent(event));
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(event);
  });

  it("does not reload a hidden tab with an unfocused draft on visibility", () => {
    const reload = vi.fn();
    const containerRef = { current: document.createElement("section") };
    const { result } = renderHook(() =>
      useAdminConfigLiveRefresh({ domains: ["templates"], reload, containerRef }),
    );
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => publishAdminConfigEvent({ ...event, actorUserId: "user-2" }));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.pending?.domain).toBe("templates");
  });
  it("shows a reconnect notice and only reloads upon explicit refresh", () => {
    const reload = vi.fn();
    const containerRef = { current: document.createElement("section") };
    const { result } = renderHook(() =>
      useAdminConfigLiveRefresh({ domains: ["templates"], reload, containerRef }),
    );
    act(() => publishAdminConfigReconnect());
    expect(result.current.pending?.reason).toBe("reconnect");
    expect(reload).not.toHaveBeenCalled();
    act(() => result.current.refreshNow());
    expect(result.current.pending).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
