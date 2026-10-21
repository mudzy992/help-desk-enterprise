import { useCallback, useEffect, useRef } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { readApiRequestId } from "@/lib/map-api-error";

const telemetryWindowMs = 60_000;
const lastTelemetryAt = new Map<string, number>();

export type PollResult = "continue" | "stop";

type Options = {
  readonly poll: () => Promise<PollResult | void>;
  readonly intervalMs: number;
  readonly enabled?: boolean;
  readonly maxBackoffMs?: number;
  readonly telemetryKey: string;
  readonly immediate?: boolean;
  readonly onError?: (error: unknown) => void;
};

function reportPollingFailure(key: string, error: unknown) {
  const now = Date.now();
  const last = lastTelemetryAt.get(key) ?? 0;
  if (now - last < telemetryWindowMs) return;
  lastTelemetryAt.set(key, now);
  reportClientError(key, error, readApiRequestId(error));
}

/** Network polling policy: visible + online, no overlap, bounded backoff and immediate recovery. */
export function useVisibilityAwarePolling({
  poll,
  intervalMs,
  enabled = true,
  maxBackoffMs = intervalMs * 8,
  telemetryKey,
  immediate = true,
  onError,
}: Options): { readonly refreshNow: () => Promise<void> } {
  const mounted = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const stopped = useRef(false);
  const failures = useRef(0);
  const timer = useRef<number | null>(null);
  const pollRef = useRef(poll);
  const errorRef = useRef(onError);
  pollRef.current = poll;
  errorRef.current = onError;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const canPoll = useCallback(
    () =>
      mounted.current &&
      enabled &&
      !stopped.current &&
      document.visibilityState === "visible" &&
      navigator.onLine,
    [enabled],
  );

  const schedule = useCallback(() => {
    clearTimer();
    if (!mounted.current || !enabled || stopped.current || !navigator.onLine) return;
    const delay = Math.min(intervalMs * 2 ** failures.current, maxBackoffMs);
    timer.current = window.setTimeout(() => {
      if (canPoll()) void execute();
      else schedule();
    }, delay);
  }, [canPoll, clearTimer, intervalMs, maxBackoffMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const execute = useCallback(async () => {
    if (!canPoll()) return;
    if (inFlight.current !== null) return inFlight.current;
    const request = (async () => {
      try {
        const result = await pollRef.current();
        if (!mounted.current) return;
        failures.current = 0;
        if (result === "stop") stopped.current = true;
      } catch (error) {
        if (!mounted.current) return;
        failures.current += 1;
        errorRef.current?.(error);
        reportPollingFailure(telemetryKey, error);
      } finally {
        inFlight.current = null;
        if (mounted.current) schedule();
      }
    })();
    inFlight.current = request;
    return request;
  }, [canPoll, schedule, telemetryKey]);

  useEffect(() => {
    mounted.current = true;
    stopped.current = false;
    failures.current = 0;
    const resume = () => {
      if (canPoll()) void execute();
      else clearTimer();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", clearTimer);
    if (enabled && immediate) void execute();
    else if (enabled) schedule();
    return () => {
      mounted.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", clearTimer);
    };
  }, [canPoll, clearTimer, enabled, execute, immediate, schedule]);

  const refreshNow = useCallback(async () => execute(), [execute]);
  return { refreshNow };
}
