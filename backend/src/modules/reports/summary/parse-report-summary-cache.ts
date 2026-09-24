import type {
  DashboardSummaryResponse,
  DashboardSummaryScope,
  SlaExposureCounts,
  SlaSummaryResponse,
} from './report-summary.types';
import { dashboardSummaryScopes } from './report-summary.types';

/**
 * Shape checks for the cached payloads.
 *
 * A value that does not match is a cache miss, never an error: the entry could
 * have been written by an older build, and recomputing is always correct.
 */
export function parseDashboardSummaryResponse(
  value: unknown,
): DashboardSummaryResponse | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isScope(value.scope) || typeof value.generatedAt !== 'string') {
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
  for (const field of numbers) {
    if (typeof value[field] !== 'number') {
      return null;
    }
  }
  if (!Array.isArray(value.statusCounts) || !Array.isArray(value.priorityCounts)) {
    return null;
  }
  return value as unknown as DashboardSummaryResponse;
}

export function parseSlaSummaryResponse(
  value: unknown,
): SlaSummaryResponse | null {
  if (!isRecord(value) || typeof value.generatedAt !== 'string') {
    return null;
  }
  if (!isExposure(value.totals) || !Array.isArray(value.profiles)) {
    return null;
  }
  for (const profile of value.profiles) {
    if (!isRecord(profile) || typeof profile.slaProfileId !== 'string') {
      return null;
    }
    if (!isExposure(profile.exposure) || !Array.isArray(profile.priorities)) {
      return null;
    }
  }
  return value as unknown as SlaSummaryResponse;
}

function isExposure(value: unknown): value is SlaExposureCounts {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.open === 'number' &&
    typeof value.onTrack === 'number' &&
    typeof value.atRisk === 'number' &&
    typeof value.breached === 'number'
  );
}

function isScope(value: unknown): value is DashboardSummaryScope {
  return (
    typeof value === 'string' &&
    dashboardSummaryScopes.includes(value as DashboardSummaryScope)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
