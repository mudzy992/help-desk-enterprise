import { useCallback, useSyncExternalStore } from "react";
import { loginWithPassword } from "@/services/auth-api";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredSession,
} from "@/services/session-store";

const listeners = new Set<() => void>();

function emitSessionChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoredSession | null {
  return readStoredSession();
}

export function useSession() {
  const session = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await loginWithPassword({ email, password });
    writeStoredSession({
      accessToken: response.accessToken,
      principal: response.principal,
    });
    emitSessionChange();
  }, []);

  const signOut = useCallback(() => {
    clearStoredSession();
    emitSessionChange();
  }, []);

  return {
    session,
    currentUserId: session?.principal.subjectId ?? null,
    signIn,
    signOut,
  };
}
