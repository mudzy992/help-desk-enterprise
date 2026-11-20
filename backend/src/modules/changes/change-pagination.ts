/**
 * W7.76 (`BA-changes-18`): one cursor contract for the change collections that
 * used to be silently cut.
 *
 * Before this module the register was the only list with `nextCursor`; the
 * timeline stopped at 200 events, the template catalogue at 500 rows and the
 * approval page loaded 500 votes across all rounds. Nothing in those responses
 * said "there is more", so a long-lived change looked complete while its oldest
 * history was simply not there. A list that cannot be paged must say so; a list
 * that can be paged returns the cursor for the next page.
 */

/** Page size bounds per collection; the default is what the UI asks for. */
export type ChangeListLimits = { readonly default: number; readonly max: number };

export const changeListLimits = {
  /**
   * Timeline (§14). A busy change accumulates events per lifecycle action,
   * per link and per reminder; 50 is one screen and 200 is the ceiling.
   */
  events: { default: 50, max: 200 },
  /** Standard catalogue (§13): read by managers, edited one row at a time. */
  templates: { default: 50, max: 500 },
  /**
   * Votes of earlier rounds (§8). The current round is never paged: it holds at
   * most one vote per voter and the voter set is capped by `cabVotersMax`.
   */
  approvals: { default: 50, max: 500 },
} as const satisfies Record<string, ChangeListLimits>;

/**
 * `?limit=` as a page size: absent or unparsable → default, otherwise 1..max.
 * Accepts a number as well, because the services are also called from code and
 * the clamp has to hold on that path too.
 */
export function changeListLimit(raw: unknown, limits: ChangeListLimits): number {
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(parsed)) return limits.default;
  return Math.min(Math.max(parsed, 1), limits.max);
}

/** A cursor is an opaque row id; anything longer than an id is not one. */
export function changeListCursor(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value.length > 0 && value.length <= 64 ? value : undefined;
}

/** Prisma reads one row past the page to know whether another page exists. */
export function changeOverFetch(limit: number): number {
  return limit + 1;
}

/**
 * The page a collection returns: the rows, whether more exist, and the id to
 * ask for next. `nextCursor` is `null` exactly when `hasMore` is false, so a
 * client never has to guess what an empty cursor means.
 */
export type ChangePage<T> = {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

/** Slices an over-fetched page and derives the cursor from the last row shown. */
export function changePage<T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
): ChangePage<T> {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items[items.length - 1];
  return { items, hasMore, nextCursor: hasMore && last !== undefined ? last.id : null };
}

/** Query strings of the three paged change collections, already clamped. */
export function changePageQuery(
  raw: { readonly limit?: unknown; readonly cursor?: unknown },
  limits: ChangeListLimits,
): { readonly limit: number; readonly cursor?: string } {
  const cursor = changeListCursor(raw.cursor);
  return cursor === undefined
    ? { limit: changeListLimit(raw.limit, limits) }
    : { limit: changeListLimit(raw.limit, limits), cursor };
}
