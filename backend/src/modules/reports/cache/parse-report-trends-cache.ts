import { reportTrendGranularities } from '../trends/report-trends.constants';
import type { ReportTrends } from '../trends/report-trends.types';
import {
  everyItem,
  hasCounts,
  hasIsoWindow,
  isCount,
  isCsat,
  isDuration,
  isFiniteNumber,
  isInteger,
  isIsoInstant,
  isNonEmptyString,
  isPlainRecord,
  isRatio,
} from './report-cache-shape';

/**
 * W7.105 (`BA-reports-15`): strict validator for cached trends.
 *
 * Trends are the most nested payload in the module (92 buckets × 6 aggregates × 3 sections), so the old check —
 * "points is an array, totals and topServices are objects" — was almost no check at all: a payload with
 * `points: [{}]` rendered a table of `NaN`. Every field the chart and the table read is verified here, and the
 * granularity must be one this build actually knows; an unknown value means the value is not ours.
 */
const granularities = new Set<string>(reportTrendGranularities);

export function parseReportTrendsCache(value: unknown): ReportTrends | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  if (
    typeof value.granularity !== 'string' ||
    !granularities.has(value.granularity)
  ) {
    return null;
  }
  if (
    !isNonEmptyString(value.timeZone) ||
    !hasIsoWindow(value.window) ||
    !hasIsoWindow(value.previousWindow) ||
    !isIsoInstant(value.generatedAt) ||
    !isFilters(value.filters)
  ) {
    return null;
  }
  if (!everyItem(value.points, isPoint) || !isTotals(value.totals) || !isTopServices(value.topServices)) {
    return null;
  }
  if (!isSettings(value.settings)) {
    return null;
  }
  return value as unknown as ReportTrends;
}

function isFilters(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (!isNonEmptyString(value.organizationalUnitId)) {
    return false;
  }
  return (
    isNullableString(value.serviceId) &&
    isNullableString(value.groupId) &&
    isNullableString(value.priority)
  );
}

function isPoint(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.key) &&
    isIsoInstant(value.start) &&
    isIsoInstant(value.end) &&
    typeof value.partial === 'boolean' &&
    isCount(value.created) &&
    isCount(value.resolved) &&
    isInteger(value.net) &&
    isCount(value.backlog) &&
    isDuration(value.firstResponse) &&
    isDuration(value.resolution) &&
    isRatio(value.slaResponse) &&
    isRatio(value.slaResolution) &&
    isCsat(value.csat)
  );
}

function isTotals(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (!hasCounts(value, ['created', 'resolved', 'backlogStart', 'backlogEnd', 'resolvedWithoutSla'])) {
    return false;
  }
  return (
    isInteger(value.net) &&
    isRatio(value.slaResponse) &&
    isRatio(value.slaResolution) &&
    isCsat(value.csat)
  );
}

function isTopServices(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (
    !everyItem(
      value.items,
      (item) =>
        isPlainRecord(item) &&
        isNonEmptyString(item.serviceId) &&
        typeof item.name === 'string' &&
        isCount(item.current) &&
        isCount(item.previous) &&
        (item.changePercent === null || isFiniteNumber(item.changePercent)),
    )
  ) {
    return false;
  }
  return (
    isPlainRecord(value.other) &&
    isCount(value.other.current) &&
    isCount(value.other.previous) &&
    isCount(value.totalCurrent) &&
    isCount(value.totalPrevious)
  );
}

function isSettings(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isFiniteNumber(value.slaTargetPercent) &&
    isCount(value.csatMinSample) &&
    isFiniteNumber(value.csatScaleMax) &&
    value.csatScaleMax > 0 &&
    isFiniteNumber(value.csatSatisfiedMinRating)
  );
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}