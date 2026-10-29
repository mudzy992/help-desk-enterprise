type IdleScheduler = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
};

/** Prefetch one likely next page without competing with the current route's critical work. */
export function scheduleIdlePrefetch(
  load: () => Promise<unknown>,
  scheduler: IdleScheduler = window,
): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) void load().catch(() => undefined);
  };

  if (scheduler.requestIdleCallback) {
    const handle = scheduler.requestIdleCallback(run, { timeout: 2_000 });
    return () => {
      cancelled = true;
      scheduler.cancelIdleCallback?.(handle);
    };
  }

  const handle = scheduler.setTimeout(run, 1_000);
  return () => {
    cancelled = true;
    scheduler.clearTimeout(handle);
  };
}
