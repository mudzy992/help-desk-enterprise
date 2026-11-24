import { createHmac, randomUUID } from 'node:crypto';
import { countSearchQueryCharacters } from './normalize-search-query';
import type { SearchGroupName } from './search.types';

/**
 * W7.112 (`BA-search-11`): privacy-safe, low-cardinality telemetry for
 * `GET /search`.
 *
 * The audit asked for per-group latency, an "incomplete" signal and a
 * candidate-to-visible view, and for the same answer it asked that **no raw
 * search term ever be stored** — a query is free text and routinely contains a
 * person's name, a hostname or a ticket title. This module is the contract for
 * what may leave the process:
 *
 * - the term is represented by its **length in characters** and a **keyed hash**
 *   (HMAC-SHA256, truncated). Without the salt the hash cannot be reversed and
 *   two short common needles cannot be dictionary-guessed back from it;
 * - nothing else about the caller is stored — no actor id, no address, no ids of
 *   the matched tickets/articles/users. Only counts, states, durations and the
 *   requested group names;
 * - durations are reported in milliseconds **and** in a fixed bucket, so a
 *   dashboard can aggregate without knowing individual timings.
 *
 * The record is written as one `key=value` line (the house metric format of
 * Phase 0/4.1, see `format-job-metrics.ts`) to the application log; the log and
 * metrics pipeline derives the counters/p95 from it. No new Redis keys, no new
 * endpoint, no change to the response contract.
 */

/** One bucket per order of magnitude, plus the two "fast" steps the UI feels. */
export const searchLatencyBuckets = [
  'lt10',
  'lt25',
  'lt50',
  'lt100',
  'lt250',
  'lt500',
  'lt1000',
  'gte1000',
] as const;

export type SearchLatencyBucket = (typeof searchLatencyBuckets)[number];

const latencyThresholdsMs = [10, 25, 50, 100, 250, 500, 1000] as const;

export function searchLatencyBucket(durationMs: number): SearchLatencyBucket {
  for (const [index, threshold] of latencyThresholdsMs.entries()) {
    if (durationMs < threshold) {
      return searchLatencyBuckets[index] as SearchLatencyBucket;
    }
  }
  return 'gte1000';
}

/**
 * W7.112: the per-group SLO. The ticket and people groups are single indexed
 * reads, the article group walks a bounded keyset scan (up to
 * `knowledgeBaseConstants.maximumListScanBatches` batches), and the whole
 * request runs the three groups in parallel — so the total budget is the
 * slowest group plus orchestration, not the sum. The numbers are targets for
 * alerting on the emitted line, not hard timeouts: a breach is logged, the
 * answer is still returned.
 */
export const searchSlo = {
  groupMs: {
    ticket: 250,
    article: 500,
    user: 250,
  } satisfies Record<SearchGroupName, number>,
  totalMs: 900,
} as const;

export type SearchGroupTelemetryState = 'ok' | 'failed' | 'skipped';

export type SearchGroupTelemetry = {
  readonly group: SearchGroupName;
  readonly state: SearchGroupTelemetryState;
  /** Rows the group returned — `0` for `failed` and `skipped`. */
  readonly hits: number;
  readonly durationMs: number;
  /**
   * `true` when the group answered with exactly `limit` hits (so more may exist)
   * or when the article scan stopped at its budget. `false` means the answer is
   * exhaustive. This is the per-group "incomplete" signal of the finding; the
   * response contract keeps `articlesIncomplete` for the article group only.
   */
  readonly truncated: boolean;
};

export type SearchRequestStatus =
  /** Every requested group answered. */
  | 'ok'
  /** At least one group failed for an availability reason (`failedGroups`). */
  | 'partial'
  /** No requested group answered — the endpoint answered `503`. */
  | 'unavailable'
  /** A fatal (authorization/client) error was rethrown — the request ended there. */
  | 'rejected';

export type SearchTelemetryRecord = {
  readonly status: SearchRequestStatus;
  /** `q` length in characters (code points) after normalization. */
  readonly queryLength: number;
  /** HMAC-SHA256 of the normalized needle, first 16 hex characters. */
  readonly queryHash: string;
  readonly requestedTypes: readonly SearchGroupName[];
  readonly limit: number;
  readonly durationMs: number;
  readonly groups: readonly SearchGroupTelemetry[];
};

/** Characters of the HMAC kept in the line: 64 bits, plenty to group by. */
export const searchQueryHashLength = 16;

/**
 * The salt for `queryHash`. A deployment sets `SEARCH_TELEMETRY_SALT`; when it
 * is absent the process falls back to a random per-process salt, so a hash can
 * never be reversed with a public dictionary — it just cannot be correlated
 * across restarts either. Both behaviours are deliberately non-fatal: telemetry
 * must never stop a search from answering.
 */
export function searchTelemetrySalt(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.SEARCH_TELEMETRY_SALT?.trim();
  if (configured !== undefined && configured !== '') {
    return configured;
  }
  return randomUUID();
}

/**
 * The only description of the needle that may leave the process: its length and
 * a keyed hash. The raw term is **not** part of the result, and no function in
 * this module accepts it into a formatter.
 */
export function describeSearchTerm(
  term: string,
  salt: string,
): { readonly length: number; readonly hash: string } {
  return {
    length: countSearchQueryCharacters(term),
    hash: createHmac('sha256', salt)
      .update(term, 'utf8')
      .digest('hex')
      .slice(0, searchQueryHashLength),
  };
}

/** SLO breaches are counted per group (only groups that actually ran) plus the total. */
export function countSearchSloBreaches(record: SearchTelemetryRecord): number {
  const groupBreaches = record.groups.filter(
    (group) =>
      group.state !== 'skipped' &&
      group.durationMs > searchSlo.groupMs[group.group],
  ).length;
  return groupBreaches + (record.durationMs > searchSlo.totalMs ? 1 : 0);
}

function formatGroup(group: SearchGroupTelemetry): string {
  // `state:hits:durationMs:truncated` — fixed shape, no free text, no ids.
  return [
    `search_group_${group.group}=${group.state}:${group.hits}:${group.durationMs}:${group.truncated}`,
  ].join('');
}

/**
 * One `key=value` line per answered request. Every value is a number, an enum or
 * a comma-separated list of enum values — there is no field that can carry the
 * needle, a matched id or an actor.
 */
export function formatSearchTelemetry(record: SearchTelemetryRecord): string {
  const truncatedGroups = record.groups
    .filter((group) => group.state !== 'skipped' && group.truncated)
    .map((group) => group.group)
    .join(',');
  return [
    // A key of its own, so every token of the line is a `key=value` pair: the
    // field list below is the whole contract and nothing can smuggle free text.
    'search_telemetry=1',
    `status=${record.status}`,
    `query_len=${record.queryLength}`,
    `query_hash=${record.queryHash}`,
    `types=${record.requestedTypes.join(',')}`,
    `limit=${record.limit}`,
    `duration_ms=${record.durationMs}`,
    `latency_bucket=${searchLatencyBucket(record.durationMs)}`,
    ...record.groups.map(formatGroup),
    `incomplete=${truncatedGroups}`,
    `slo_breaches=${countSearchSloBreaches(record)}`,
  ].join(' ');
}
