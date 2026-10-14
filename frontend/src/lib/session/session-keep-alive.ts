import { refreshSession } from "@/services/auth-api";
import { readStoredSession, storedSessionFrom, writeStoredSession } from "@/services/session-store";

/**
 * The API issues
 * 1 h tokens. While the user is active the SPA refreshes the token when less
 * than `refreshWindowMs` is left; an idle tab (no input for the whole token
 * lifetime) is not extended and the session ends on its own.
 */
export const sessionKeepAlive = {
  checkEveryMs: 60_000,
  refreshWindowMs: 10 * 60_000,
  idleLimitMs: 60 * 60_000,
} as const;

export type KeepAliveDecision = "refresh" | "expire" | "wait";

export function decideKeepAlive(input: {
  readonly now: number;
  readonly expiresAt: number | null;
  readonly lastActivityAt: number;
}): KeepAliveDecision {
  if (input.expiresAt === null) return "wait";
  if (input.expiresAt <= input.now) return "expire";
  const idle = input.now - input.lastActivityAt >= sessionKeepAlive.idleLimitMs;
  if (input.expiresAt - input.now <= sessionKeepAlive.refreshWindowMs && !idle) {
    return "refresh";
  }
  return "wait";
}

/** Starts the loop; returns a stop function. */
export function startSessionKeepAlive(input: {
  readonly onSessionChanged: () => void;
  readonly onExpired: () => void;
}): () => void {
  let lastActivityAt = Date.now();
  let refreshing = false;
  const markActive = () => {
    lastActivityAt = Date.now();
  };
  const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
  for (const name of events) window.addEventListener(name, markActive, { passive: true });

  const tick = async () => {
    const session = readStoredSession();
    if (session === null || refreshing) return;
    const decision = decideKeepAlive({
      now: Date.now(),
      expiresAt: session.expiresAt,
      lastActivityAt,
    });
    if (decision === "expire") {
      input.onExpired();
      return;
    }
    if (decision !== "refresh") return;
    refreshing = true;
    try {
      const response = await refreshSession();
      writeStoredSession(storedSessionFrom(response));
      input.onSessionChanged();
    } catch {
      // A 401 is handled globally (sign-in); network errors retry next tick.
    } finally {
      refreshing = false;
    }
  };
  const timer = window.setInterval(() => void tick(), sessionKeepAlive.checkEveryMs);
  void tick();
  return () => {
    window.clearInterval(timer);
    for (const name of events) window.removeEventListener(name, markActive);
  };
}
