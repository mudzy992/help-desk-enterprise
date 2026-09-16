import { useCallback, useSyncExternalStore } from "react";
import {
  changePasswordOnFirstLogin,
  isMustChangePasswordResponse,
  loginWithPassword,
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
