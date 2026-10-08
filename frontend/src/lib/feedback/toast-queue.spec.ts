import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOAST_DURATION,
  MAX_VISIBLE_TOASTS,
  enqueueToast,
  removeToast,
  resolveToastDuration,
  visibleToasts,
  type ToastRecord,
} from "./toast-queue";

function incoming(id: number, title = `T${id}`, tone: ToastRecord["tone"] = "success") {
  return { id, tone, title, duration: 5000 };
}

describe("toast queue", () => {
  it("merges an identical message instead of stacking it", () => {
    let queue: readonly ToastRecord[] = [];
    queue = enqueueToast(queue, incoming(1, "Snimljeno")).queue;
    const second = enqueueToast(queue, incoming(2, "Snimljeno"));
    expect(second.id).toBe(1);
    expect(second.queue).toHaveLength(1);
    expect(second.queue[0]).toMatchObject({ count: 2, revision: 1 });
  });

  it("keeps different tones with the same title apart", () => {
    let queue: readonly ToastRecord[] = [];
    queue = enqueueToast(queue, incoming(1, "X", "success")).queue;
    queue = enqueueToast(queue, incoming(2, "X", "danger")).queue;
    expect(queue).toHaveLength(2);
  });

  it("keeps the newest request ID on a merged error", () => {
    let queue: readonly ToastRecord[] = [];
    queue = enqueueToast(queue, { ...incoming(1, "Greška", "danger"), requestId: "a" }).queue;
    queue = enqueueToast(queue, { ...incoming(2, "Greška", "danger"), requestId: "b" }).queue;
    expect(queue[0]?.requestId).toBe("b");
  });

  it("shows at most three and promotes the queued ones on dismiss", () => {
    let queue: readonly ToastRecord[] = [];
    for (let id = 1; id <= 5; id += 1) queue = enqueueToast(queue, incoming(id)).queue;
    expect(visibleToasts(queue).map((record) => record.id)).toEqual([1, 2, 3]);
    expect(MAX_VISIBLE_TOASTS).toBe(3);
    queue = removeToast(queue, 2);
    expect(visibleToasts(queue).map((record) => record.id)).toEqual([1, 3, 4]);
  });

  it("gives errors the longest default and honours 0 as sticky", () => {
    expect(resolveToastDuration("danger", undefined)).toBe(DEFAULT_TOAST_DURATION.danger);
    expect(DEFAULT_TOAST_DURATION.danger).toBeGreaterThan(DEFAULT_TOAST_DURATION.success);
    expect(resolveToastDuration("success", 0)).toBe(0);
    expect(resolveToastDuration("info", -5)).toBe(0);
    expect(resolveToastDuration("info", 1200)).toBe(1200);
  });
});
