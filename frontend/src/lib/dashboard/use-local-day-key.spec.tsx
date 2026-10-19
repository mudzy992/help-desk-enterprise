// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { millisecondsUntilNextLocalDay, useLocalDayKey } from "@/lib/dashboard/use-local-day-key";

describe("useLocalDayKey", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates the next local midnight", () => {
    expect(millisecondsUntilNextLocalDay(new Date(2026, 9, 19, 23, 59, 30))).toBe(30_000);
  });

  it("rotates the key when a dashboard remains open across midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19, 23, 59, 59, 900));
    const { result } = renderHook(() => useLocalDayKey());
    expect(result.current).toBe("2026-10-19");

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("2026-10-20");
  });
});
