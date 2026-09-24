import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { IntervalHistogram } from 'node:perf_hooks';

/**
 * Publishes event loop lag as a periodic log line.
 *
 * Lag is the earliest signal that a synchronous job (SLA scan, report export,
 * JSON serialisation) is blocking the process; Phase 1–4 gates read it from the
 * same log stream as `db_queries_per_request`.
 */

export type EventLoopLagSample = {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
};

export type EventLoopLagLogger = {
  log(message: string, context?: string): void;
};

export type EventLoopLagMonitorOptions = {
  readonly intervalMs: number;
  readonly resolutionMs: number;
};

export const defaultEventLoopLagMonitorOptions: EventLoopLagMonitorOptions = {
  intervalMs: 10_000,
  resolutionMs: 20,
};

export const eventLoopLagLogContext = 'EventLoopLag';

/** Nanoseconds (the histogram unit) to whole milliseconds. */
export function toMilliseconds(nanoseconds: number): number {
  if (!Number.isFinite(nanoseconds) || nanoseconds <= 0) {
    return 0;
  }
  return Math.round(nanoseconds / 1_000_000);
}

export function formatEventLoopLagSample(sample: EventLoopLagSample): string {
  return (
    `event_loop_lag_p95_ms=${sample.p95Ms}` +
    ` event_loop_lag_p50_ms=${sample.p50Ms}` +
    ` event_loop_lag_max_ms=${sample.maxMs}`
  );
}

export function readEventLoopLagSample(
  histogram: Pick<IntervalHistogram, 'percentile' | 'max'>,
): EventLoopLagSample {
  return {
    p50Ms: toMilliseconds(histogram.percentile(50)),
    p95Ms: toMilliseconds(histogram.percentile(95)),
    maxMs: toMilliseconds(histogram.max),
  };
}

/**
 * Starts the sampler and returns the stop function. The histogram is reset on
 * every tick so each line describes its own window instead of the process
 * lifetime.
 */
export function startEventLoopLagMonitor(
  logger: EventLoopLagLogger,
  options: EventLoopLagMonitorOptions = defaultEventLoopLagMonitorOptions,
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: options.resolutionMs });
  histogram.enable();
  const timer = setInterval(() => {
    logger.log(formatEventLoopLagSample(readEventLoopLagSample(histogram)), eventLoopLagLogContext);
    histogram.reset();
  }, options.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
