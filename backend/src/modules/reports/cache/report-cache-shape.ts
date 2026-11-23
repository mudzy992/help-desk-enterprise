import { reportCacheCollectionCap } from './report-cache-envelope';

/**
 * W7.105 (`BA-reports-15`): the primitives every report cache validator is built from.
 *
 * They are deliberately boring and deliberately strict:
 *
 * - `isPlainRecord` rejects arrays and `null` (the old `typeof value === 'object'` check accepted both);
 * - `isFiniteNumber` rejects `NaN` and `±Infinity`, which JSON can carry (a bare `NaN` is not valid JSON, but a
 *   stringified `1e999` parses to `Infinity`, and a computed value may have been `NaN` before serialisation);
 * - `isCount` additionally requires a non-negative integer, because every counter here counts rows;
 * - `isBoundedArray` refuses a collection longer than the cap before looking inside it, so a poisoned payload
 *   cannot make the validator itself expensive.
 */
export type JsonRecord = Record<string, unknown>;

export function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isCount(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

/** An integer that may legitimately be negative (`net` in the trend totals). */
export function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** `Date.parse` accepts a lot, but it rejects the shapes that break `new Date(...)` on the client. */
export function isIsoInstant(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/** A record whose every listed field satisfies `check`. Missing fields fail, extras are ignored. */
export function hasFields(
  value: unknown,
  check: (record: JsonRecord) => boolean,
): boolean {
  return isPlainRecord(value) && check(value);
}

export function hasCounts(record: JsonRecord, fields: readonly string[]): boolean {
  return fields.every((field) => isCount(record[field]));
}

export function hasNullableNumbers(record: JsonRecord, fields: readonly string[]): boolean {
  return fields.every((field) => record[field] === null || isFiniteNumber(record[field]));
}

export function hasIsoWindow(value: unknown): value is { readonly from: string; readonly to: string } {
  return isPlainRecord(value) && isIsoInstant(value.from) && isIsoInstant(value.to);
}

export function isBoundedArray(
  value: unknown,
  cap: number = reportCacheCollectionCap,
): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= cap;
}

/** Bounded array whose every item satisfies `check`. */
export function everyItem(
  value: unknown,
  check: (item: unknown) => boolean,
  cap: number = reportCacheCollectionCap,
): boolean {
  return isBoundedArray(value, cap) && value.every(check);
}

/** `{ total, met, percent }` — the SLA ratio every trend payload carries. */
export function isRatio(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isCount(value.total) &&
    isCount(value.met) &&
    (value.percent === null || isFiniteNumber(value.percent))
  );
}

/** `{ medianHours, p90Hours, sampleCount }` — durations are nullable, the sample count is not. */
export function isDuration(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    (value.medianHours === null || isFiniteNumber(value.medianHours)) &&
    (value.p90Hours === null || isFiniteNumber(value.p90Hours)) &&
    isCount(value.sampleCount)
  );
}

/** `{ count, average, satisfiedPercent, lowSample }`. */
export function isCsat(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isCount(value.count) &&
    (value.average === null || isFiniteNumber(value.average)) &&
    (value.satisfiedPercent === null || isFiniteNumber(value.satisfiedPercent)) &&
    typeof value.lowSample === 'boolean'
  );
}

/** `{ key, label, value }` — the bars of the dashboard charts. */
export function isNamedBar(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.label) &&
    isCount(value.value)
  );
}
