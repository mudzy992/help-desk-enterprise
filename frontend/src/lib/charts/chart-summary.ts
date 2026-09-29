import type { TFunction } from "i18next";

/**
 * Text alternative for charts (2.8 §3.6, WCAG 1.1.1): per series the highest,
 * lowest and latest value with their bucket labels. Pure, so it is unit-tested
 * and shared by every time-series chart.
 */
export interface SeriesInput {
  readonly label: string;
  readonly values: readonly (number | null)[];
  readonly format?: (value: number) => string;
}

export interface SeriesExtremes {
  readonly max: { readonly value: number; readonly index: number };
  readonly min: { readonly value: number; readonly index: number };
  readonly last: { readonly value: number; readonly index: number };
}

export function seriesExtremes(values: readonly (number | null)[]): SeriesExtremes | null {
  let result: { max: SeriesExtremes["max"]; min: SeriesExtremes["min"]; last: SeriesExtremes["last"] } | null = null;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    if (result === null) {
      result = { max: { value, index }, min: { value, index }, last: { value, index } };
      return;
    }
    if (value > result.max.value) result.max = { value, index };
    if (value < result.min.value) result.min = { value, index };
    result.last = { value, index };
  });
  return result;
}

/** Accepts i18next's TFunction; keys are built at runtime, so the typed overloads are bypassed. */
type Translate = TFunction;

function tr(t: Translate, key: string, options?: Record<string, string | number>): string {
  return t(key as never, (options ?? {}) as never) as unknown as string;
}

export function describeSeries(
  t: Translate,
  series: SeriesInput,
  bucketLabels: readonly string[],
): string {
  const extremes = seriesExtremes(series.values);
  if (extremes === null) {
    return tr(t, "a11y.chart.seriesEmpty", { series: series.label });
  }
  const format = series.format ?? ((value: number) => String(value));
  const at = (index: number) => bucketLabels[index] ?? String(index + 1);
  return tr(t, "a11y.chart.series", {
    series: series.label,
    max: format(extremes.max.value),
    maxAt: at(extremes.max.index),
    min: format(extremes.min.value),
    minAt: at(extremes.min.index),
    last: format(extremes.last.value),
    lastAt: at(extremes.last.index),
  });
}

export function describeChart(
  t: Translate,
  series: readonly SeriesInput[],
  bucketLabels: readonly string[],
): string {
  if (bucketLabels.length === 0) {
    return tr(t, "a11y.chart.empty");
  }
  const range = tr(t, "a11y.chart.range", {
    from: bucketLabels[0] ?? "",
    to: bucketLabels[bucketLabels.length - 1] ?? "",
  });
  return [range, ...series.map((item) => describeSeries(t, item, bucketLabels))].join(" ");
}
