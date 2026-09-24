/**
 * Pure geometry for the SVG charts.
 *
 * Kept out of the components on purpose: the scaling rules are where charts
 * break silently (an empty series, a single point, an all-zero series would
 * divide by zero and paint `NaN` into the markup). Living here they are covered
 * by unit tests instead of being validated by eye.
 */

export interface PlotPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PlotSize {
  readonly width: number;
  readonly height: number;
  readonly padding: PlotPadding;
}

/** Upper bound of the value axis: 15% headroom, never zero or NaN. */
export function resolvePlotMax(
  values: readonly number[],
  headroom = 1.15,
): number {
  const highest = values.reduce(
    (max, value) => (Number.isFinite(value) && value > max ? value : max),
    0,
  );
  return highest > 0 ? highest * headroom : 1;
}

export function plotInnerWidth(size: PlotSize): number {
  return size.width - size.padding.left - size.padding.right;
}

export function plotInnerHeight(size: PlotSize): number {
  return size.height - size.padding.top - size.padding.bottom;
}

/** Horizontal position of a point; a single point sits on the left edge. */
export function plotX(index: number, count: number, size: PlotSize): number {
  const inner = plotInnerWidth(size);
  const step = count > 1 ? inner / (count - 1) : 0;
  return size.padding.left + index * step;
}

/**
 * Vertical position of a value; `max` comes from `resolvePlotMax`.
 * Non-finite input (a stray `Infinity`, an unparsed number) is drawn on the
 * baseline, and anything outside the axis is clamped, so the returned
 * coordinate always stays inside the plot box.
 */
export function plotY(value: number, max: number, size: PlotSize): number {
  const inner = plotInnerHeight(size);
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const y = size.padding.top + inner - (safeValue / safeMax) * inner;
  // Invariant: a coordinate never escapes the plot box.
  return Math.min(Math.max(y, size.padding.top), size.padding.top + inner);
}

/** `M…L…` polyline for one series. */
export function buildLinePath(
  values: readonly number[],
  max: number,
  size: PlotSize,
): string {
  return values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${plotX(index, values.length, size).toFixed(1)},${plotY(value, max, size).toFixed(1)}`,
    )
    .join(" ");
}

/** Closed area under the line — the gradient fill of the dual area chart. */
export function buildAreaPath(
  values: readonly number[],
  max: number,
  size: PlotSize,
): string {
  const baselineY = size.padding.top + plotInnerHeight(size);
  const rightX = size.padding.left + plotInnerWidth(size);
  return `${buildLinePath(values, max, size)} L${rightX.toFixed(1)},${baselineY} L${size.padding.left},${baselineY} Z`;
}
