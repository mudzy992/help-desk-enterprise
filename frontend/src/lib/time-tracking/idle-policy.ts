/**
 * Package 1.3 (T3): pure idle rules, shared by the timer host and its tests.
 * "Inactive" = every tab hidden OR no keyboard/pointer input for the idle window.
 * Activity is shared across tabs through localStorage, so a hidden tab never
 * pauses a timer while another tab of the same user is in use.
 */
export const heartbeatIntervalMilliseconds = 60_000;
export const activityWriteThrottleMilliseconds = 10_000;
export const activityStorageKey = "ep-helpdesk.timeActivityAt";

export type IdleInput = {
  readonly now: number;
  /** Latest input seen in any tab (ms since epoch). */
  readonly lastActivityAt: number;
  /** When this tab became hidden, or null while it is visible. */
  readonly hiddenSince: number | null;
  readonly idleMinutes: number;
};

export type IdleDecision =
  | { readonly kind: "active"; readonly sendHeartbeat: boolean }
  | { readonly kind: "idle"; readonly endedAt: number };

export function decideIdle(input: IdleInput): IdleDecision {
  const lastActive =
    input.hiddenSince === null
      ? input.lastActivityAt
      : Math.max(Math.min(input.lastActivityAt, input.now), 0);
  if (input.idleMinutes > 0 && input.now - lastActive >= input.idleMinutes * 60_000) {
    return { kind: "idle", endedAt: lastActive };
  }
  // Heartbeat only proves activity: a visible tab with recent input sends it.
  const recentlyActive = input.now - input.lastActivityAt < heartbeatIntervalMilliseconds * 2;
  return { kind: "active", sendHeartbeat: input.hiddenSince === null && recentlyActive };
}

export function formatElapsed(fromIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}
