export type SessionPrincipal = {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
};

export type StoredSession = {
  readonly accessToken: string;
  readonly principal: SessionPrincipal;
};

const sessionStorageKey = "ep-helpdesk.session";

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

function parseStoredSession(raw: string | null): StoredSession | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      parsed.accessToken.length === 0 ||
      parsed.principal === undefined ||
      typeof parsed.principal.subjectId !== "string"
    ) {
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}
