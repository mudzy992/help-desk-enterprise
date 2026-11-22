/**
 * W7.86 (`BA-knowledge-base-13`): reads `queue.getJobSchedulers()` correctly.
 *
 * `getJobSchedulers()` does **not** put a modern scheduler's id in `id`. In BullMQ
 * 5.81 the entry for a scheduler created by `upsertJobScheduler` is
 * `{ key: '<scheduler id>', name, next, pattern, … }` — `transformSchedulerData`
 * sets `key` to the id and never sets `id`. `id` only appears for **legacy**
 * repeatable keys (`keyToData`), where `key` is the raw
 * `name:id:endDate:tz:pattern` string and `id` is the id inside it.
 *
 * Comparing only `entry.id` therefore reports every modern scheduler as missing:
 * each worker re-registers a healthy schedule on every reconcile tick and logs a
 * false “recovered” warning — noise that hides the one warning the operator is
 * supposed to act on. The ops-health collector already reads
 * `scheduler.key ?? scheduler.id` for the same reason; this helper gives the
 * reconcile paths one shared, tested predicate instead of seven copies of the
 * wrong one.
 */
export type JobSchedulerRef = {
  readonly key?: string | null;
  readonly id?: string | null;
};

/** True when `schedulerId` is in a `getJobSchedulers()` page, in either shape. */
export function isSchedulerRegistered(
  entries: readonly JobSchedulerRef[],
  schedulerId: string,
): boolean {
  return entries.some((entry) => entry.key === schedulerId || entry.id === schedulerId);
}

/** The subset of `schedulerIds` that Redis no longer has; empty means healthy. */
export function missingSchedulers(
  entries: readonly JobSchedulerRef[],
  schedulerIds: readonly string[],
): string[] {
  return schedulerIds.filter((schedulerId) => !isSchedulerRegistered(entries, schedulerId));
}
