/**
 * W7.105 (`BA-reports-15`): the one place where report caches are read and written.
 *
 * The audit found that every Redis reader did `JSON.parse` and then a handful of `typeof` checks, and accepted
 * whatever else came back. Three consequences were real, not theoretical:
 *
 * 1. **No schema version.** A deployment that changes a payload shape leaves the previous build's values readable,
 *    and a rollback leaves the new shape readable by the old code. The only bound was the TTL.
 * 2. **No size bound.** `JSON.parse` and the validator ran over whatever was stored; a 40 MB value (a poisoned key,
 *    a bug that stored the ticket list, a shared Redis namespace) costs the event loop on every request until it
 *    expires.
 * 3. **Shallow shape checks.** `typeof value === 'object'` accepts arrays, `NaN` and `Infinity` accept themselves as
 *    numbers, and nested collections were never examined — so a stale or foreign value could reach the client.
 *
 * The envelope below answers all three: `{ v, data }` with a schema version, a byte cap checked **before** parsing is
 * attempted, and a strict validator per payload. Anything unexpected is a **miss**, never an error: the database is
 * the source of truth and recomputing is always correct.
 *
 * Version and key are different things on purpose. The key already carries `v<authzVersion>` (W7.100) — that is the
 * *authority* the payload was computed under. The envelope version is the *shape* of the payload. Two pods on
 * different builds differ in the second, never in the first.
 */

/** Bump when a cached payload's shape or meaning changes. Old entries are then simply not read. */
export const reportCacheSchemaVersion = 1;

/**
 * Cap per entry (256 KiB). The largest real payload is the trend series: ~92 points with nested objects serialise
 * to well under 100 KiB, so the cap leaves room for growth and still refuses anything pathological.
 */
export const reportCacheMaxBytes = 256 * 1024;

/**
 * Cap per collection inside a payload. Independent of the byte cap, because a thousand tiny entries cost little
 * memory but still mean the value is not ours (the biggest real lists are the aging buckets, 5, and top services).
 */
export const reportCacheCollectionCap = 5_000;

/** The slice of the Redis client this module needs, mirroring `ReportSummaryCacheClient`. */
export interface ReportCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export type ReportCacheMissReason =
  /** No Redis: the caller computes. Not an anomaly. */
  | 'no_client'
  /** The key is not there (never written, expired, or invalidated). */
  | 'absent'
  /** Stored value is larger than the cap; it is deleted (see below). */
  | 'oversized'
  /** Stored value is not JSON; it is deleted. */
  | 'invalid_json'
  /** Valid JSON, but not `{ v, data }` — a value from before the envelope. Recomputed, not trusted. */
  | 'not_enveloped'
  /** Envelope from another schema version. Recomputed; the entry is **not** deleted (rolling deploy, see below). */
  | 'version_mismatch'
  /** The envelope's version matches but the payload does not satisfy the validator. */
  | 'invalid_payload'
  /** Redis raised. Never surfaced to the caller. */
  | 'error';

export type ReportCacheRead<T> =
  | { readonly hit: true; readonly value: T; readonly bytes: number }
  | { readonly hit: false; readonly reason: ReportCacheMissReason; readonly bytes: number };

/**
 * Reads one entry and returns the decoded payload or the reason it was not used.
 *
 * Oversized and non-JSON values are **deleted**: they can never be valid, and leaving them means paying the same
 * cost on every request until the TTL. A version mismatch is deliberately *not* deleted — during a rolling deploy
 * the other build's values are perfectly valid for it, and deleting them would make the two builds evict each
 * other's work (a cache stampede at the worst possible moment). They simply expire.
 */
export async function readReportCacheEntry<T>(
  client: ReportCacheClient | null,
  key: string,
  parse: (value: unknown) => T | null,
  options: { readonly maxBytes?: number } = {},
): Promise<ReportCacheRead<T>> {
  if (client === null) {
    return { hit: false, reason: 'no_client', bytes: 0 };
  }
  const maxBytes = options.maxBytes ?? reportCacheMaxBytes;
  let raw: string | null;
  try {
    raw = await client.get(key);
  } catch {
    return { hit: false, reason: 'error', bytes: 0 };
  }
  if (raw === null) {
    return { hit: false, reason: 'absent', bytes: 0 };
  }
  const bytes = byteLength(raw);
  if (bytes > maxBytes) {
    await evict(client, key);
    return { hit: false, reason: 'oversized', bytes };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    await evict(client, key);
    return { hit: false, reason: 'invalid_json', bytes };
  }
  const envelope = readEnvelope(decoded);
  if (envelope === null) {
    return { hit: false, reason: 'not_enveloped', bytes };
  }
  if (envelope.version !== reportCacheSchemaVersion) {
    return { hit: false, reason: 'version_mismatch', bytes };
  }
  const value = parse(envelope.data);
  if (value === null) {
    return { hit: false, reason: 'invalid_payload', bytes };
  }
  return { hit: true, value, bytes };
}

/** The common case: a miss is a `null` the caller cannot tell apart from "not cached", which is what it wants. */
export async function readReportCacheValue<T>(
  client: ReportCacheClient | null,
  key: string,
  parse: (value: unknown) => T | null,
  options: { readonly maxBytes?: number } = {},
): Promise<T | null> {
  const result = await readReportCacheEntry(client, key, parse, options);
  return result.hit ? result.value : null;
}

export type ReportCacheWrite =
  | { readonly written: true; readonly bytes: number }
  | {
      readonly written: false;
      readonly bytes: number;
      readonly reason: 'no_client' | 'unserializable' | 'oversized' | 'error';
    };

/**
 * Writes `{ v, data }` under the given TTL. A payload over the cap is **not written at all** — writing it would
 * only create an entry every reader has to reject, and the caller loses nothing by recomputing.
 */
export async function writeReportCacheEntry(
  client: ReportCacheClient | null,
  key: string,
  payload: unknown,
  ttlSeconds: number,
  options: { readonly maxBytes?: number } = {},
): Promise<ReportCacheWrite> {
  if (client === null) {
    return { written: false, bytes: 0, reason: 'no_client' };
  }
  const maxBytes = options.maxBytes ?? reportCacheMaxBytes;
  let serialized: string;
  try {
    serialized = JSON.stringify({ v: reportCacheSchemaVersion, data: payload });
  } catch {
    return { written: false, bytes: 0, reason: 'unserializable' };
  }
  const bytes = byteLength(serialized);
  if (bytes > maxBytes) {
    return { written: false, bytes, reason: 'oversized' };
  }
  try {
    await client.set(key, serialized, 'EX', ttlSeconds);
  } catch {
    return { written: false, bytes, reason: 'error' };
  }
  return { written: true, bytes };
}

/** Drops one entry. Every failure is ignored: the entry expires on its own. */
export async function invalidateReportCacheEntry(
  client: ReportCacheClient | null,
  key: string,
): Promise<void> {
  if (client === null) {
    return;
  }
  await evict(client, key);
}

/**
 * `Buffer.byteLength`, not `value.length`: the cap is about memory and I/O, and a Bosnian label is two bytes per
 * character. A character count would let a payload through at almost twice its intended size.
 */
export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

async function evict(client: ReportCacheClient, key: string): Promise<void> {
  try {
    await client.del(key);
  } catch {
    // The TTL will remove it.
  }
}

/**
 * Exactly `{ v: integer ≥ 1, data }`. Requiring *exactly* two keys means a legacy payload that happens to carry `v`
 * and `data` of its own cannot be mistaken for an envelope.
 */
function readEnvelope(
  value: unknown,
): { readonly version: number; readonly data: unknown } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('v') || !keys.includes('data')) {
    return null;
  }
  const version = (value as { v?: unknown }).v;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return null;
  }
  return { version, data: (value as { data?: unknown }).data };
}
