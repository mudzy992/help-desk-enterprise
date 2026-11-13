// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTicketCollectionRealtime } from "./use-ticket-collection-realtime";

const fake = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: (name: string, fn: (...args: unknown[]) => void) => {
      listeners.set(name, fn);
    },
    off: (name: string) => {
      listeners.delete(name);
    },
  };
  return {
    socket,
    listeners,
    emit: (name: string, value?: unknown) => listeners.get(name)?.(value),
  };
});
vi.mock("@/lib/session/use-session", () => ({ useSession: () => ({ session: { id: "user" } }) }));
vi.mock("@/services/helpdesk-socket", () => ({
  acquireHelpdeskSocket: () => fake.socket,
  releaseHelpdeskSocket: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fake.socket.connected = true;
});
afterEach(() => {
  cleanup();
  fake.listeners.clear();
  vi.useRealTimers();
});
const visibility = (value: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("ticket collection recovery", () => {
  it("reloads once after hidden group events when the tab becomes visible", () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useTicketCollectionRealtime(reload));
    act(() => {
      visibility("hidden");
      fake.emit("group.feed-changed", {});
      fake.emit("group.feed-changed", {});
      vi.advanceTimersByTime(500);
    });
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      visibility("visible");
      vi.advanceTimersByTime(300);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("defers a hidden reconnect and cancels pending work on unmount", () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useTicketCollectionRealtime(reload));
    act(() => {
      visibility("hidden");
      fake.emit("connect");
      vi.advanceTimersByTime(500);
    });
    expect(reload).not.toHaveBeenCalled();
    unmount();
    act(() => {
      visibility("visible");
      vi.advanceTimersByTime(500);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(fake.listeners.size).toBe(0);
  });
  it("reloads after reconnect even without another event", () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useTicketCollectionRealtime(reload));
    act(() => {
      fake.socket.connected = false;
      fake.emit("disconnect");
      fake.socket.connected = true;
      fake.emit("connect");
      vi.advanceTimersByTime(300);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
