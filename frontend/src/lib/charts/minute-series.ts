/*
  Per-minute series for the bar strip charts (Nadzor → Sigurnosne metrike).

  The security metrics endpoint returns one point per minute of the last hour
  (up to 60 points). Two properties of that data are handled here, pure and
  unit-tested, because both were wrong in the first live version:

    * the two series were matched by **array index**; they are matched by their
      `at` timestamp now, so a missing or late bucket in one series cannot shift
      the other one;
    * 60 x-axis labels were rendered, which is what pushed the chart out of the
      card. `axisTickIndexes` returns at most a handful of evenly spread ticks.

  Nothing here is chart-specific beyond "one bucket per minute in, bars out".
*/

export type MinuteSeriesPoint = {
  readonly at: string;
  readonly count: number;
};

export type MinuteBarPoint = {
  readonly at: string;
  readonly a: number;
  readonly b: number;
};

/**
 * Merges two per-minute series into one row per minute, ordered by time. A
 * minute missing from one series is a real zero in that series, not a hole, so
 * the two strips always describe the same minutes. Duplicate buckets (which the
 * endpoint should never produce) are summed instead of silently dropped.
 */
export function alignMinuteSeries(
  first: readonly MinuteSeriesPoint[] | undefined,
  second: readonly MinuteSeriesPoint[] | undefined,
): MinuteBarPoint[] {
  const byMinute = new Map<string, { at: string; a: number; b: number }>();
  const add = (points: readonly MinuteSeriesPoint[] | undefined, side: "a" | "b") => {
    for (const point of points ?? []) {
      const existing = byMinute.get(point.at) ?? { at: point.at, a: 0, b: 0 };
      existing[side] += point.count;
      byMinute.set(point.at, existing);
    }
  };
  add(first, "a");
  add(second, "b");
  return [...byMinute.values()].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

/** Shared scale of both series; 1 as the floor so an all-zero hour still draws. */
export function minuteBarsMax(points: readonly { readonly a: number; readonly b: number }[]): number {
  const highest = points.reduce((max, point) => Math.max(max, point.a, point.b), 0);
  return highest > 0 ? highest : 1;
}

/** Highest single value of one series, for the "peak" readout above a strip. */
export function seriesPeak(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

/**
 * Bar height in percent of the strip. A minute with events never renders as
 * nothing: the minimum visible bar keeps a single late sign-in from looking
 * like an empty minute.
 */
export function barHeightPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const percent = (value / Math.max(max, 1)) * 100;
  return Math.min(100, Math.max(4, Math.round(percent)));
}

/**
 * Indices of the buckets that get an x-axis tick: at most `tickCount`, evenly
 * spread, always including the first and the last bucket. 60 labels under a
 * 60-point chart is both unreadable and a horizontal-overflow bug.
 */
export function axisTickIndexes(length: number, tickCount = 5): number[] {
  if (length <= 0) return [];
  const count = Math.max(2, Math.min(tickCount, length));
  const indexes = new Set<number>();
  for (let step = 0; step < count; step += 1) {
    indexes.add(Math.round((step * (length - 1)) / (count - 1)));
  }
  return [...indexes].sort((left, right) => left - right);
}
