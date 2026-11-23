import {
  everyItem,
  hasCounts,
  isCount,
  isIsoInstant,
  isNonEmptyString,
  isPlainRecord,
} from '../cache/report-cache-shape';
import type {
  DashboardSummaryResponse,
  SlaExposureCounts,
  SlaSummaryResponse,
} from './report-summary.types';

/**
 * W7.105 (`BA-reports-15`): strict validators for the cached summaries.
 *
 * The previous versions checked that the top-level keys existed and that `volume14d` had fourteen entries, then
 * returned the value unchanged. Two holes were real:
 *
 * - `isRecord` accepted an **array** (arrays are `typeof 'object'`), so `[]` satisfied "is a record" and only failed
 *   later on a missing field;
 * - the elements of `statusCounts`, `priorityCounts`, `profiles` and `profiles[].priorities` were never looked at,
 *   and the counters were only `typeof === 'number'` — `-1`, `1.5` and `Infinity` all passed.
 *
 * Every counter here counts rows, so it must be a non-negative integer; every collection is bounded; every date must
 * actually parse. Anything else is a miss: the queries are the source of truth.
 */
export function parseDashboardSummaryResponse(
  value: unknown,
): DashboardSummaryResponse | null {
  if (!isPlainRecord(value) || !isIsoInstant(value.generatedAt)) {
    return null;
  }
  const numbers = [
    'total',
    'open',
    'critical',
    'overdue',
    'openedToday',
    'waitingForUser',
    'pendingApproval',
    'resolved',
    'closed',
    'unrouted',
    'unassigned',
    'assignedToMe',
    'requestedByMe',
  ] as const;
  if (!hasCounts(value, numbers)) {
    return null;
  }
  if (
    !everyItem(
      value.statusCounts,
      (entry) =>
        isPlainRecord(entry) && isNonEmptyString(entry.status) && isCount(entry.count),
    ) ||
    !everyItem(
      value.priorityCounts,
      (entry) =>
        isPlainRecord(entry) && isNonEmptyString(entry.priority) && isCount(entry.count),
    )
  ) {
    return null;
  }
  // Exactly fourteen days: the sparkline draws fourteen slots and an extra point would be drawn, not ignored.
  if (!Array.isArray(value.volume14d) || value.volume14d.length !== 14) {
    return null;
  }
  for (const day of value.volume14d) {
    if (
      !isPlainRecord(day) ||
      !isIsoInstant(day.date) ||
      !isCount(day.created) ||
      !isCount(day.resolved)
    ) {
      return null;
    }
  }
  return value as unknown as DashboardSummaryResponse;
}

export function parseSlaSummaryResponse(
  value: unknown,
): SlaSummaryResponse | null {
  if (!isPlainRecord(value) || !isIsoInstant(value.generatedAt)) {
    return null;
  }
  if (!isExposure(value.totals)) {
    return null;
  }
  return everyItem(
    value.profiles,
    (profile) =>
      isPlainRecord(profile) &&
      isNonEmptyString(profile.slaProfileId) &&
      isExposure(profile.exposure) &&
      everyItem(
        profile.priorities,
        (entry) =>
          isPlainRecord(entry) && isNonEmptyString(entry.priority) && isExposure(entry.exposure),
      ),
  )
    ? (value as unknown as SlaSummaryResponse)
    : null;
}

function isExposure(value: unknown): value is SlaExposureCounts {
  return (
    isPlainRecord(value) &&
    isCount(value.open) &&
    isCount(value.onTrack) &&
    isCount(value.atRisk) &&
    isCount(value.breached)
  );
}
