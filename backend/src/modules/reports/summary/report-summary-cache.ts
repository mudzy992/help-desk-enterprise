import {
  invalidateReportCacheEntry,
  readReportCacheValue,
  writeReportCacheEntry,
  type ReportCacheClient,
} from '../cache/report-cache-envelope';

/**
 * Dashboard/SLA counters are cached for fifteen seconds and keyed by user. The
 * removed client scope parameter no longer multiplies cache keys for one payload.
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
/*
 * Staging k6 (2026-09-25, 100k tickets): a miss is one GROUP BY over the visible
 * set (~600 ms), and at 15 s it landed in the p95. The owner approved 60 s
 * (changes the plan's "refresh within 30 s" acceptance to 60 s). Override with
 * REPORT_SUMMARY_CACHE_TTL_SECONDS (positive integer).
 */
function readReportSummaryCacheTtlSeconds(): number {
  const parsed = Number(process.env.REPORT_SUMMARY_CACHE_TTL_SECONDS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60;
}

export const reportSummaryCacheTtlSeconds = readReportSummaryCacheTtlSeconds();

export const dashboardSummaryCacheKeyPrefix = 'reports:dashboard-summary';
export const slaSummaryCacheKeyPrefix = 'reports:sla-summary';

/**
 * The slice of the Redis client this cache needs, so tests can drive it with a
 * fake and the "Redis is not there" case stays explicit (a `null` client).
 *
 * W7.105 (`BA-reports-15`): reads and writes go through the shared report cache envelope
 * (`../cache/report-cache-envelope.ts`), which stamps a schema version, caps the entry size and deletes a value that
 * can never be valid. A payload from another build (or from before the envelope) is a miss, not a parse.
 */
export type ReportSummaryCacheClient = ReportCacheClient;

/**
 * `…:<user>:v<user.authzVersion>:<zone>`.
 *
 * W7.100 (`BA-reports-10`): the payload is a projection of *what this user may see*, so it must not outlive the
 * authority it was computed under. `User.authzVersion` is the same fence the principal-context cache and the
 * session check use: every security change (role/permission, group membership, OU move, deactivation, password
 * reset) increments it. Because the version is **part of the key**, a revoke makes the old entry unreachable on
 * the very next request instead of within the TTL — the cache can no longer serve counters computed under wider
 * access. The old key is left to expire (60 s) rather than deleted: no writer has to know which users to evict.
 *
 * The installation zone stays part of the key on purpose: the counters carry a day boundary ("opened today"), so
 * a payload computed in the old zone must not be served after the setting changes. Two zones, two keys.
 */
export function dashboardSummaryCacheKey(
  userId: string,
  authzVersion: number,
  timeZone: string,
): string {
  return `${dashboardSummaryCacheKeyPrefix}:${userId}:v${authzVersion}:${timeZone}`;
}

export function slaSummaryCacheKey(
  userId: string,
  authzVersion: number,
): string {
  return `${slaSummaryCacheKeyPrefix}:${userId}:v${authzVersion}`;
}

/**
 * Reads one cached payload. `parse` decides whether the unwrapped payload still has the expected shape; anything else
 * (missing key, oversized value, invalid JSON, another schema version, invalid payload) is a miss.
 */
export async function readReportSummaryCache<T>(
  client: ReportSummaryCacheClient | null,
  key: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  return readReportCacheValue(client, key, parse);
}

export async function writeReportSummaryCache(
  client: ReportSummaryCacheClient | null,
  key: string,
  payload: unknown,
): Promise<void> {
  // A payload over the cap, or one that cannot be serialised, is simply not cached: the database remains the source
  // of truth and the next read computes the counters again.
  await writeReportCacheEntry(client, key, payload, reportSummaryCacheTtlSeconds);
}

/** Drops one entry (used by tests and any future write-through invalidation). */
export async function invalidateReportSummaryCache(
  client: ReportSummaryCacheClient | null,
  key: string,
): Promise<void> {
  await invalidateReportCacheEntry(client, key);
}
