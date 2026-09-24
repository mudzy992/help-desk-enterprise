import { monitorEventLoopDelay } from 'node:perf_hooks';
import {
  formatEventLoopLagSample,
  readEventLoopLagSample,
  startEventLoopLagMonitor,
  toMilliseconds,
} from './event-loop-lag.monitor';

describe('event loop lag monitor', () => {
  it('converts nanoseconds to whole milliseconds and clamps junk', () => {
    expect(toMilliseconds(1_500_000)).toBe(2);
    expect(toMilliseconds(0)).toBe(0);
    expect(toMilliseconds(-5)).toBe(0);
    expect(toMilliseconds(Number.NaN)).toBe(0);
  });

  it('formats the sample as a single greppable line', () => {
    expect(formatEventLoopLagSample({ p50Ms: 3, p95Ms: 12, maxMs: 40 })).toBe(
      'event_loop_lag_p95_ms=12 event_loop_lag_p50_ms=3 event_loop_lag_max_ms=40',
    );
  });

  it('reads percentiles from a histogram', () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    try {
      histogram.enable();
      const sample = readEventLoopLagSample(histogram);

      expect(sample.p50Ms).toBeGreaterThanOrEqual(0);
      expect(sample.p95Ms).toBeGreaterThanOrEqual(sample.p50Ms);
      expect(sample.maxMs).toBeGreaterThanOrEqual(sample.p95Ms);
    } finally {
      histogram.disable();
    }
  });

  it('logs on every interval and stops cleanly', () => {
    jest.useFakeTimers();
    const logger = { log: jest.fn() };
    try {
      const stop = startEventLoopLagMonitor(logger, {
        intervalMs: 1000,
        resolutionMs: 10,
      });

      jest.advanceTimersByTime(3000);
      expect(logger.log).toHaveBeenCalledTimes(3);
      expect(String(logger.log.mock.calls[0]?.[0])).toContain('event_loop_lag_p95_ms=');

      stop();
      jest.advanceTimersByTime(3000);
      expect(logger.log).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
