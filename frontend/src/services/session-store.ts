import type { AuthenticationSessionResponse } from "@/services/auth-api";

export type SessionPrincipal = {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
};

/**
 * What the browser may keep about its session. The session token itself lives in
 * an HttpOnly cookie set by the API, so scripts never read it; `expiresAt` (epoch
 * ms) lets the keep-alive loop know when to refresh.
 */
export type StoredSession = {
  readonly principal: SessionPrincipal;
  readonly expiresAt: number;
};

export const sessionStorageKey = "service-desk.session";

/** The stored session for a sign-in or refresh answer, with the expiry the cookie carries. */
export function storedSessionFrom(
  response: AuthenticationSessionResponse,
  now: number = Date.now(),
): StoredSession {
  return {
    principal: response.principal,
    expiresAt: now + response.expiresInSeconds * 1000,
  };
}

let cachedRaw: string | null | undefined;
let cachedSession: StoredSession | null = null;

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(sessionStorageKey);
  if (raw === cachedRaw) {
    return cachedSession;
  }
  cachedRaw = raw;
  cachedSession = parseStoredSession(raw);
  if (raw !== null && cachedSession === null) {
    // Entries written before the cookie session carried a bearer token. Drop
    // them so the token never lingers in script-readable storage.
    window.localStorage.removeItem(sessionStorageKey);
    cachedRaw = null;
  }
  return cachedSession;
}

export function writeStoredSession(session: StoredSession): void {
  if (typeof window === "undefined") {
    return;
  }
  const raw = JSON.stringify(session);
  window.localStorage.setItem(sessionStorageKey, raw);
  cachedRaw = raw;
  cachedSession = session;
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(sessionStorageKey);
  cachedRaw = null;
  cachedSession = null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseStoredSession(raw: string | null, now: number = Date.now()): StoredSession | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Record<string, unknown>;
    const principal = candidate.principal;
    if (
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt <= now ||
      typeof principal !== "object" ||
      principal === null
    ) {
      return null;
    }

    const principalCandidate = principal as Record<string, unknown>;
    if (
      !isNonEmptyString(principalCandidate.subjectId) ||
      !isNonEmptyString(principalCandidate.email) ||
      !isNonEmptyString(principalCandidate.displayName) ||
      typeof principalCandidate.isLocalOnly !== "boolean"
    ) {
      return null;
    }

    return {
      expiresAt: candidate.expiresAt,
      principal: {
        subjectId: principalCandidate.subjectId,
        email: principalCandidate.email,
        displayName: principalCandidate.displayName,
        isLocalOnly: principalCandidate.isLocalOnly,
      },
    };
  } catch {
    return null;
  }
}
