// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";

const setVisible = (value: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, "onLine", { configurable: true, value });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useVisibilityAwarePolling", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisible("visible");
    setOnline(true);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("pauses while hidden and refreshes once immediately when visible", async () => {
    setVisible("hidden");
    const poll = vi.fn(async () => undefined);
    renderHook(() =>
      useVisibilityAwarePolling({ poll, intervalMs: 1_000, telemetryKey: "test.hidden" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(poll).not.toHaveBeenCalled();

    setVisible("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(poll).toHaveBeenCalledOnce();
  });

  it("pauses offline and refreshes on the online event", async () => {
    setOnline(false);
    const poll = vi.fn(async () => undefined);
    renderHook(() =>
      useVisibilityAwarePolling({ poll, intervalMs: 1_000, telemetryKey: "test.online" }),
    );
    expect(poll).not.toHaveBeenCalled();
    setOnline(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(poll).toHaveBeenCalledOnce();
  });

  it("never overlaps requests", async () => {
    const pending = deferred();
    const poll = vi.fn(() => pending.promise);
    const { result } = renderHook(() =>
      useVisibilityAwarePolling({ poll, intervalMs: 100, telemetryKey: "test.overlap" }),
    );
    await act(async () => {
      void result.current.refreshNow();
      void result.current.refreshNow();
      await Promise.resolve();
    });
    expect(poll).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
  });

  it("backs off after failure and resets cadence after recovery", async () => {
    const poll = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(undefined);
    renderHook(() =>
      useVisibilityAwarePolling({
        poll,
        intervalMs: 100,
        maxBackoffMs: 800,
        telemetryKey: "test.backoff",
      }),
    );
    await act(() => Promise.resolve());
    await act(() => vi.advanceTimersByTimeAsync(199));
    expect(poll).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(poll).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("rate-limits telemetry for repeated best-effort failures", async () => {
    const poll = vi.fn(async () => {
      throw new Error("down");
    });
    const { result } = renderHook(() =>
      useVisibilityAwarePolling({ poll, intervalMs: 100, telemetryKey: "test.telemetry" }),
    );
    await act(async () => {
      await Promise.resolve();
      await result.current.refreshNow();
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("stops after a completed job and cleans up on unmount", async () => {
    const poll = vi.fn(async () => "stop" as const);
    const { unmount } = renderHook(() =>
      useVisibilityAwarePolling({ poll, intervalMs: 100, telemetryKey: "test.stop" }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(poll).toHaveBeenCalledOnce();
    unmount();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(poll).toHaveBeenCalledOnce();
  });
});
