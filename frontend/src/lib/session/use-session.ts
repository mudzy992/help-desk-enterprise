import { useCallback, useSyncExternalStore } from "react";
import {
  changePasswordOnFirstLogin,
  confirmSignInMfaEnrollment,
  isMfaResponse,
  isMustChangePasswordResponse,
  verifyMfaCode,
  type AuthenticationLoginResponse,
  type AuthenticationSessionResponse,
  loginWithEntraIdToken,
  loginWithPassword,
  logoutSession,
} from "@/services/auth-api";
import { forgetEntraConfiguration, signOutOfEntra } from "@/lib/auth/entra-redirect";
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
      readonly reason: "temporary" | "expired";
    }
  // Paket 2.1: the second factor comes next.
  | { readonly kind: "mfa_required"; readonly mfaToken: string }
  | { readonly kind: "mfa_enrollment_required"; readonly mfaToken: string };

function storeSession(response: AuthenticationSessionResponse): void {
  writeStoredSession({
    accessToken: response.accessToken,
    principal: response.principal,
  });
  emitSessionChange();
}

/** Maps a login-shaped response; stores the session when one was issued. */
function toSignInOutcome(response: AuthenticationLoginResponse): SignInOutcome {
  if (isMustChangePasswordResponse(response)) {
    return {
      kind: "must_change_password",
      passwordChangeToken: response.passwordChangeToken,
      expiresInSeconds: response.expiresInSeconds,
      reason: response.reason ?? "temporary",
    };
  }
  if (isMfaResponse(response)) {
    return response.status === "MFA_REQUIRED"
      ? { kind: "mfa_required", mfaToken: response.mfaToken }
      : { kind: "mfa_enrollment_required", mfaToken: response.mfaToken };
  }
  storeSession(response);
  return { kind: "authenticated" };
}

export function useSession() {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInOutcome> => {
      const response = await loginWithPassword({ email, password });
      // A local (break-glass) session never triggers Entra single logout.
      forgetEntraConfiguration();
      return toSignInOutcome(response);
    },
    [],
  );

  /** Paket 1.8 (A1): Microsoft ID token → application session. */
  const signInWithEntra = useCallback(async (idToken: string): Promise<void> => {
    const response = await loginWithEntraIdToken(idToken);
    writeStoredSession({
      accessToken: response.accessToken,
      principal: response.principal,
    });
    emitSessionChange();
  }, []);

  const completePasswordChange = useCallback(
    async (
      passwordChangeToken: string,
      newPassword: string,
    ): Promise<SignInOutcome> => {
      const response = await changePasswordOnFirstLogin({
        passwordChangeToken,
        newPassword,
      });
      return toSignInOutcome(response);
    },
    [],
  );

  /** Paket 2.1: TOTP or recovery code → session. */
  const completeMfa = useCallback(async (mfaToken: string, code: string): Promise<void> => {
    storeSession(await verifyMfaCode({ mfaToken, code }));
  }, []);

  /**
   * Paket 2.1: forced enrollment. The session is held back until the user has
   * seen the recovery codes (`finish`), otherwise the login page redirects away.
   */
  const confirmMfaEnrollment = useCallback(
    async (
      mfaToken: string,
      code: string,
    ): Promise<{ readonly recoveryCodes: readonly string[]; readonly finish: () => void }> => {
      const response = await confirmSignInMfaEnrollment({ mfaToken, code });
      return { recoveryCodes: response.recoveryCodes, finish: () => storeSession(response) };
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
    // Optional Entra single logout; a no-op for local sessions.
    void signOutOfEntra().catch(() => undefined);
  }, []);

  return {
    session,
    currentUserId: session?.principal.subjectId ?? null,
    signIn,
    signInWithEntra,
    completePasswordChange,
    completeMfa,
    confirmMfaEnrollment,
    signOut,
  };
}
