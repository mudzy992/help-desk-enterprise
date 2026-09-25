import { useCallback, useSyncExternalStore } from "react";
import {
  changePasswordOnFirstLogin,
  isMustChangePasswordResponse,
  loginWithPassword,
  logoutSession,
} from "@/services/auth-api";
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

/** Session ended outside a user action (expired / revoked / 401). */
export function expireSession(): void {
  if (readStoredSession() === null) return;
  clearStoredSession();
  emitSessionChange();
}

/** Keep-alive stored a refreshed token. */
export function notifySessionRefreshed(): void {
  emitSessionChange();
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

function getServerSnapshot(): StoredSession | null {
  return null;
}

export type SignInOutcome =
  | { readonly kind: "authenticated" }
  | {
      readonly kind: "must_change_password";
      readonly passwordChangeToken: string;
      readonly expiresInSeconds: number;
    };

export function useSession() {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInOutcome> => {
      const response = await loginWithPassword({ email, password });
      if (isMustChangePasswordResponse(response)) {
        return {
          kind: "must_change_password",
          passwordChangeToken: response.passwordChangeToken,
          expiresInSeconds: response.expiresInSeconds,
        };
      }
      writeStoredSession({
        accessToken: response.accessToken,
        principal: response.principal,
      });
      emitSessionChange();
      return { kind: "authenticated" };
    },
    [],
  );

  const completePasswordChange = useCallback(
    async (
      passwordChangeToken: string,
      newPassword: string,
    ): Promise<void> => {
      const response = await changePasswordOnFirstLogin({
        passwordChangeToken,
        newPassword,
      });
      writeStoredSession({
        accessToken: response.accessToken,
        principal: response.principal,
      });
      emitSessionChange();
    },
    [],
  );

  const signOut = useCallback(() => {
    // Review 2026-09-25 (S1): revoke on the server too; the local sign-out
    // does not wait for it (offline sign-out must still work).
    if (readStoredSession() !== null) {
      void logoutSession().catch(() => undefined);
    }
    clearStoredSession();
    emitSessionChange();
  }, []);

  return {
    session,
    currentUserId: session?.principal.subjectId ?? null,
    signIn,
    completePasswordChange,
    signOut,
  };
}
