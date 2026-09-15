import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleDebouncedCallback } from "./schedule-debounced-callback";

describe("scheduleDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst into a single run", () => {
    const run = vi.fn();
    const scheduled = scheduleDebouncedCallback(run, 300);
    scheduled.trigger();
    scheduled.trigger();
    vi.advanceTimersByTime(299);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending run", () => {
    const run = vi.fn();
    const scheduled = scheduleDebouncedCallback(run, 300);
    scheduled.trigger();
    scheduled.cancel();
    vi.advanceTimersByTime(300);
    expect(run).not.toHaveBeenCalled();
  });
});
