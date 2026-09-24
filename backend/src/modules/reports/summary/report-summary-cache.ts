/**
 * Phase 2.4 (plan §2.4): the dashboard/SLA counters are cached for fifteen
 * seconds, keyed by user and scope.
 *
 * Fifteen rather than thirty: the plan allows 15–30 s and the acceptance is
 * "counters refresh within 30 s", so the shorter end of the band keeps the
 * numbers honest while still absorbing a reload wave (the client refreshes on
 * every realtime ticket event). Nothing here invalidates per write — that would
 * mean teaching every ticket mutation which caches to drop; the TTL is the
 * documented bound on staleness instead.
 *
 * Every failure is a miss: a broken cache may cost queries, never an error.
 */
export const reportSummaryCacheTtlSeconds = 15;

export const dashboardSummaryCacheKeyPrefix = 'reports:dashboard-summary';
export const slaSummaryCacheKeyPrefix = 'reports:sla-summary';

/**
 * The slice of the Redis client this cache needs, so tests can drive it with a
 * fake and the "Redis is not there" case stays explicit (a `null` client).
 */
export interface ReportSummaryCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * `…:<user>:<scope>:<zone>` — the installation zone is part of the key on
 * purpose: the counters carry a day boundary ("opened today"), so a payload
 * computed in the old zone must not be served for the fifteen seconds after
 * the setting changes. Two zones, two keys.
 */
export function dashboardSummaryCacheKey(
  userId: string,
  scope: string,
  timeZone: string,
): string {
  return `${dashboardSummaryCacheKeyPrefix}:${userId}:${scope}:${timeZone}`;
}

export function slaSummaryCacheKey(userId: string): string {
  return `${slaSummaryCacheKeyPrefix}:${userId}`;
}

/**
 * Reads one cached payload. `parse` decides whether the stored JSON still has
 * the expected shape; anything else (missing key, invalid JSON, another shape)
 * is a miss.
 */
export async function readReportSummaryCache<T>(
  client: ReportSummaryCacheClient | null,
  key: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  if (client === null) {
    return null;
  }
  try {
    const cached = await client.get(key);
    if (cached === null) {
      return null;
    }
    return parse(JSON.parse(cached) as unknown);
  } catch {
    return null;
  }
}

export async function writeReportSummaryCache(
  client: ReportSummaryCacheClient | null,
  key: string,
  payload: unknown,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    await client.set(
      key,
      JSON.stringify(payload),
      'EX',
      reportSummaryCacheTtlSeconds,
    );
  } catch {
    // The database remains the source of truth; a failed write only means the
    // next read computes the counters again.
  }
}

/** Drops one entry (used by tests and any future write-through invalidation). */
export async function invalidateReportSummaryCache(
  client: ReportSummaryCacheClient | null,
  key: string,
): Promise<void> {
  if (client === null) {
    return;
  }
  try {
    await client.del(key);
  } catch {
    // The entry expires on its own within the TTL.
  }
}
