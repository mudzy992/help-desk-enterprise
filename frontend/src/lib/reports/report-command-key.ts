/**
 * W7.106 (`BA-reports-16`): „send now” is a command, and a command needs an identity that survives a retry.
 *
 * The cache lives in the panel and holds **one key per schedule** for as long as the outcome is unknown. That is the
 * whole contract:
 *
 * - clicking again while a request is in flight is blocked by the button state, but a *retry after an error* is a
 *   real second request — it must carry the same key, otherwise the first attempt and the retry become two reports;
 * - the key is released only when the server gave a definite answer, so the next deliberate send gets a fresh key.
 *
 * It is a pure map on purpose: the rule is testable without rendering the panel.
 */
export type ReportCommandKeyCache = Map<string, string>;

/** The key for this schedule, minting one the first time it is asked for. */
export function commandKeyFor(
  cache: ReportCommandKeyCache,
  scheduleId: string,
  mint: () => string,
): string {
  const existing = cache.get(scheduleId);
  if (existing !== undefined) return existing;
  const created = mint();
  cache.set(scheduleId, created);
  return created;
}

/** The command finished (successfully or not); the next deliberate send is a new command. */
export function releaseCommandKey(cache: ReportCommandKeyCache, scheduleId: string): void {
  cache.delete(scheduleId);
}
