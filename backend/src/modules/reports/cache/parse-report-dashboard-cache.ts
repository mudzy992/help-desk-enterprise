import type { ReportsDashboard } from '../dashboard/build-reports-dashboard';
import {
  everyItem,
  hasCounts,
  isCount,
  hasIsoWindow,
  hasNullableNumbers,
  isFiniteNumber,
  isIsoInstant,
  isNamedBar,
  isNonEmptyString,
  isPlainRecord,
} from './report-cache-shape';

/**
 * W7.105 (`BA-reports-15`): strict validator for the cached dashboard.
 *
 * Before this, `isReportsDashboard` checked nine `typeof`/`Array.isArray` results and nothing inside them: a value
 * with the right top-level keys but `volumeSeries: [null]`, `aging: {}` or `kpis: { createdCount: 'x' }` was served
 * to the client. Everything the screen reads is checked here, one level down, and every collection is bounded.
 *
 * Unknown extra keys are allowed on purpose: a newer build adding a field should not make an older build's cache
 * unreadable *if the shape version still matches* — and when the shape changes, the version is bumped instead.
 */
export function parseReportDashboardCache(value: unknown): ReportsDashboard | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  if (
    !isNonEmptyString(value.timeZone) ||
    !hasIsoWindow(value.window) ||
    !hasIsoWindow(value.previousWindow) ||
    !isCount(value.ticketCount)
  ) {
    return null;
  }
  if (!isKpis(value.kpis)) {
    return null;
  }
  if (typeof value.bottlenecksEnabled !== 'boolean') {
    return null;
  }
  for (const bars of [
    value.bottleneckByGroup,
    value.serviceVolume,
    value.originUnitVolume,
    value.assigneeWorkload,
  ]) {
    if (!everyItem(bars, isNamedBar)) {
      return null;
    }
  }
  if (
    !everyItem(
      value.volumeSeries,
      (point) =>
        isPlainRecord(point) &&
        isIsoInstant(point.d) &&
        isCount(point.created) &&
        isCount(point.resolved),
    )
  ) {
    return null;
  }
  if (!isAging(value.aging)) {
    return null;
  }
  return value as unknown as ReportsDashboard;
}

function isKpis(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const counts = [
    'createdCount',
    'firstResponseSampleCount',
    'resolutionSampleCount',
    'csatCount',
    'kbHelpedCount',
  ] as const;
  if (!hasCounts(value, counts)) {
    return false;
  }
  const nullable = [
    'createdDeltaPercent',
    'firstResponseMinutes',
    'firstResponseDeltaMinutes',
    'resolutionHours',
    'resolutionDeltaHours',
    'csatAverage',
    'kbResolutionRate',
  ] as const;
  if (!hasNullableNumbers(value, nullable)) {
    return false;
  }
  // The CSAT scale is a divisor on the client; zero or a negative would render `Infinity`/`NaN`.
  return isFiniteNumber(value.csatScaleMax) && value.csatScaleMax > 0;
}

function isAging(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasCounts(value, [
      'lessThanOneDay',
      'oneToThreeDays',
      'threeToSevenDays',
      'moreThanSevenDays',
      'waitingOverSevenDays',
    ])
  );
}
