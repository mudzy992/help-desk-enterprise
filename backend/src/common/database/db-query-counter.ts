/**
 * Counts database statements so a request can report how many queries it cost.
 *
 * The counter is intentionally dependency-free: the pg pool wrapper increments
 * it, the request metrics middleware drains it once the response finished.
 * Failures inside the counter must never break a query, so nothing here throws.
 */

/** Keeps the per-request map bounded when responses never arrive. */
const maxTrackedRequests = 10_000;

const queriesByRequestId = new Map<string, number>();
let totalQueries = 0;

/**
 * Records one statement. `requestId` is absent for background work (worker
 * jobs, startup checks) — those still count towards the process total.
 */
export function recordDbQuery(requestId: string | undefined): void {
  totalQueries += 1;
  if (requestId === undefined) {
    return;
  }
  if (!queriesByRequestId.has(requestId) && queriesByRequestId.size >= maxTrackedRequests) {
    const oldestRequestId = queriesByRequestId.keys().next().value;
    if (oldestRequestId !== undefined) {
      queriesByRequestId.delete(oldestRequestId);
    }
  }
  queriesByRequestId.set(requestId, (queriesByRequestId.get(requestId) ?? 0) + 1);
}

/**
 * Returns how many statements the request issued and forgets the entry, so a
 * request id can never leak between responses.
 */
export function takeDbQueryCount(requestId: string): number {
  const count = queriesByRequestId.get(requestId) ?? 0;
  queriesByRequestId.delete(requestId);
  return count;
}

/** Statements issued by the process since start, tracked and untracked. */
export function readTotalDbQueries(): number {
  return totalQueries;
}

/** Requests still waiting for their response to be counted. */
export function readTrackedRequestCount(): number {
  return queriesByRequestId.size;
}

/** Test helper — resets process-wide counters between cases. */
export function resetDbQueryCounters(): void {
  queriesByRequestId.clear();
  totalQueries = 0;
}
