/**
 * Plan §4.2 (continuation of the "fewer queries per request" work, §2.2/§2.4).
 *
 * A ticket list resolves at most five catalogues to turn ids into something a
 * human can read: the requester/assignee, the handling group, the form version,
 * the origin unit and the service. They are small, they change rarely, and every
 * list request in an installation resolves the same handful of rows — measured
 * on seeded data, those five reads are the largest single block left in the
 * `GET /tickets` request (`perf/results/ci-smoke-2026-09-24.md` §3c).
 *
 * So they are cached per id for sixty seconds, the same TTL the authorization
 * context uses. Sixty seconds is a bound on staleness, not a promise of
 * freshness: rename a group and a list may show the old name for up to a minute.
 * That is the trade the dashboard counters already make (15 s), and it is
 * documented rather than hidden — nothing here invalidates on write, because
 * that would mean teaching every catalogue mutation which caches to drop.
 *
 * A cached id is either a row or the fact that there is no row (a deleted user
 * still referenced by an old ticket). Both are stored, so a missing row does not
 * cost a query on every request; the second one is stored as the JSON literal
 * `null`, which `mget` distinguishes from "not cached" (a missing key is `null`
 * as well, so the payload is the only thing that can tell them apart).
 */

export const ticketLabelCacheTtlSeconds = 60;

export const ticketLabelKinds = [
  'user',
  'group',
  'formVersion',
  'organizationalUnit',
  'service',
] as const;

export type TicketLabelKind = (typeof ticketLabelKinds)[number];

/** A row as it was read from the database, plus its id. */
export type TicketLabelRow = { readonly id: string } & Record<string, unknown>;

export type TicketLabelCacheEntry = {
  readonly id: string;
  /** `null` records that the row does not exist. */
  readonly row: TicketLabelRow | null;
};

/**
 * The slice of the Redis client this cache needs, so tests can drive it with a
 * fake and "Redis is not there" stays explicit (a `null` client).
 */
export interface TicketLabelCacheClient {
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<unknown>;
}

/**
 * What `loadTicketDisplayLabels` talks to: `read` answers for the ids it knows
 * (a hit may be a `null` row), `write` stores what the database just returned.
 * Implemented by `TicketLabelCacheService`; tests pass a plain map.
 */
export interface TicketLabelCache {
  read(
    kind: TicketLabelKind,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, TicketLabelRow | null>>;
  write(
    kind: TicketLabelKind,
    entries: readonly TicketLabelCacheEntry[],
  ): Promise<void>;
}

export function ticketLabelCacheKey(kind: TicketLabelKind, id: string): string {
  return `label:${kind}:${id}`;
}

export type TicketLabelCacheHit =
  | { readonly hit: true; readonly row: TicketLabelRow | null }
  | { readonly hit: false };

const requiredFieldsByKind: Record<
  TicketLabelKind,
  readonly (readonly [string, 'string' | 'number'])[]
> = {
  user: [['displayName', 'string']],
  group: [['name', 'string']],
  formVersion: [['version', 'number']],
  organizationalUnit: [
    ['name', 'string'],
    ['ouPath', 'string'],
  ],
  service: [['name', 'string']],
};

/**
 * Reads one stored payload. A miss, invalid JSON and a payload with another
 * shape all end as `{ hit: false }` — the caller then reads the database. Never
 * throws: a cache that cannot be trusted may cost queries, never an error.
 */
export function parseTicketLabel(
  kind: TicketLabelKind,
  raw: string,
): TicketLabelCacheHit {
  if (raw === 'null') {
    return { hit: true, row: null };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) {
      return { hit: true, row: null };
    }
    if (typeof parsed !== 'object') {
      return { hit: false };
    }
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      return { hit: false };
    }
    for (const [field, type] of requiredFieldsByKind[kind]) {
      if (typeof candidate[field] !== type) {
        return { hit: false };
      }
    }
    return { hit: true, row: candidate as TicketLabelRow };
  } catch {
    return { hit: false };
  }
}

/**
 * Reads the ids the cache knows about, one `mget` for the whole page. The
 * returned map contains only hits, so the caller can see which ids still have to
 * be read (`row === null` means "cached: does not exist").
 */
export async function readTicketLabels(
  client: TicketLabelCacheClient | null,
  kind: TicketLabelKind,
  ids: readonly string[],
): Promise<Map<string, TicketLabelRow | null>> {
  const hits = new Map<string, TicketLabelRow | null>();
  if (client === null || ids.length === 0) {
    return hits;
  }
  try {
    const values = await client.mget(
      ...ids.map((id) => ticketLabelCacheKey(kind, id)),
    );
    ids.forEach((id, index) => {
      const raw = values[index];
      if (typeof raw !== 'string') {
        return;
      }
      const parsed = parseTicketLabel(kind, raw);
      if (parsed.hit) {
        hits.set(id, parsed.row);
      }
    });
  } catch {
    return new Map();
  }
  return hits;
}

/**
 * Stores what the database returned, including the ids it did not return: the
 * absence of a row is an answer too. A failure is swallowed — the next request
 * simply reads the database again.
 */
export async function writeTicketLabels(
  client: TicketLabelCacheClient | null,
  kind: TicketLabelKind,
  entries: readonly TicketLabelCacheEntry[],
): Promise<void> {
  if (client === null || entries.length === 0) {
    return;
  }
  try {
    await Promise.all(
      entries.map((entry) =>
        client.set(
          ticketLabelCacheKey(kind, entry.id),
          JSON.stringify(entry.row),
          'EX',
          ticketLabelCacheTtlSeconds,
        ),
      ),
    );
  } catch {
    // Fail-open: the database stays the source of truth.
  }
}
