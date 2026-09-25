import { refreshSession } from "@/services/auth-api";
import { readStoredSession, writeStoredSession } from "@/services/session-store";

/**
 * Review 2026-09-25 (owner: "1 h + automatsko produžavanje"): the API issues
 * 1 h tokens. While the user is active the SPA refreshes the token when less
 * than `refreshWindowMs` is left; an idle tab (no input for the whole token
 * lifetime) is not extended and the session ends on its own.
 */
export const sessionKeepAlive = {
  checkEveryMs: 60_000,
  refreshWindowMs: 10 * 60_000,
  idleLimitMs: 60 * 60_000,
} as const;

/** `exp` of a JWT in ms, or null when the token cannot be read. */
export function readTokenExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (part === undefined) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

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
      expiresAt: readTokenExpiryMs(session.accessToken),
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
      writeStoredSession({ accessToken: response.accessToken, principal: response.principal });
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
