import type { ApiClient } from './api-client';

export type ActiveTimer = {
  readonly timeLogId: string;
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly startedAt: string;
};

type ActiveTimerResponse = { readonly timer: ActiveTimer | null };

/**
 * Stops the caller's running timer, if there is one (idempotent).
 *
 * Why this exists — spec 14 of the third real run (2026-10-05, run `37353690845`):
 * only one timer may run per agent, so the *first* `time-start` of the spec
 * opens the "switch?" dialog when a timer is already running, and the header
 * still shows the old ticket (`T-000162` while the spec expected `T-000164`).
 * The stale timer came from the earlier run, which failed between `time-start`
 * and `time-stop`; Playwright's retry made it worse, because the retry inherited
 * the timer the first attempt left behind.
 *
 * `globalSetup` clears what a previous run left (all three actors); spec 14
 * clears its own actor again before starting, so a failed attempt cannot poison
 * its retry.
 */
export async function stopRunningTimer(api: ApiClient): Promise<ActiveTimer | null> {
  const active = await api.requestJson<ActiveTimerResponse>('/me/active-timer');
  if (active.timer === null) {
    return null;
  }
  await api.requestJson(`/tickets/${active.timer.ticketId}/time-logs/${active.timer.timeLogId}/stop`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'MANUAL' }),
  });
  return active.timer;
}
