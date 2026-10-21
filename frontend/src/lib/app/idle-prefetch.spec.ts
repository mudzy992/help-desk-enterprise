import { describe, expect, it, vi } from "vitest";
import { scheduleIdlePrefetch } from "@/lib/app/idle-prefetch";

function timeoutScheduler() {
  let callback = () => undefined;
  return {
    scheduler: {
      setTimeout: vi.fn((next: () => void) => {
        callback = next;
        return 7;
      }),
      clearTimeout: vi.fn(),
    },
    run: () => callback(),
  };
}

describe("scheduleIdlePrefetch", () => {
  it("uses the timeout fallback and can be cancelled", () => {
    const load = vi.fn(async () => undefined);
    const { scheduler, run } = timeoutScheduler();
    const cancel = scheduleIdlePrefetch(load, scheduler);

    cancel();
    run();

    expect(scheduler.clearTimeout).toHaveBeenCalledWith(7);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads only the likely next page after fallback idle time", () => {
    const load = vi.fn(async () => undefined);
    const { scheduler, run } = timeoutScheduler();
    scheduleIdlePrefetch(load, scheduler);

    run();

    expect(load).toHaveBeenCalledOnce();
  });
});
