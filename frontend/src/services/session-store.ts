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

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(sessionStorageKey);
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

export function writeStoredSession(session: StoredSession): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(sessionStorageKey);
}
