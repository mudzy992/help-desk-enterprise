import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { useCallback, useSyncExternalStore } from "react";
import {
  changePasswordOnFirstLogin,
  completePasskeyLogin,
  confirmSignInMfaEnrollment,
  fallbackMinimumPasswordLength,
  isMfaResponse,
  isMustChangePasswordResponse,
  verifyMfaCode,
  type AuthenticationLoginResponse,
  type AuthenticationSessionResponse,
  type MfaMethod,
  loginWithEntraIdToken,
  loginWithPassword,
  logoutSession,
} from "@/services/auth-api";
import { forgetEntraConfiguration, signOutOfEntra } from "@/lib/auth/entra-redirect";
import { helpdeskQueryClient } from "@/lib/query/query-client";
import {
  clearStoredSession,
  readStoredSession,
  storedSessionFrom,
  sessionStorageKey,
  writeStoredSession,
  type StoredSession,
} from "@/services/session-store";

const listeners = new Set<() => void>();
const logoutRequestTimeoutMs = 2_000;
let observedSubjectId: string | null | undefined;
let pendingLogout: Promise<void> | null = null;

function beginServerLogout(): void {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const request = logoutSession(controller.signal).catch(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve();
    }, logoutRequestTimeoutMs);
  });
  const settled = Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (pendingLogout === settled) pendingLogout = null;
  });
  pendingLogout = settled;
}

async function waitForPendingLogout(): Promise<void> {
  await pendingLogout;
}

function emitSessionChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Cached answers belong to the user who fetched them; none may survive a session. */
function clearUserScopedCache(): void {
  helpdeskQueryClient.clear();
}

/** Session ended outside a user action (expired / revoked / 401). */
export function expireSession(): void {
  if (readStoredSession() === null) return;
  clearStoredSession();
  clearUserScopedCache();
  emitSessionChange();
}

/** Keep-alive stored a refreshed token. */
export function notifySessionRefreshed(): void {
  emitSessionChange();
}

/**
 * Another tab signed in or out. Browsers fire `storage` only in the other tabs,
 * so this tab must re-read the session and drop its cached answers itself.
 */
function handleStorageChange(event: StorageEvent): void {
  if (event.key !== null && event.key !== sessionStorageKey) return;
  const nextSubjectId = readStoredSession()?.principal.subjectId ?? null;
  if (observedSubjectId !== undefined && observedSubjectId !== nextSubjectId) {
    clearUserScopedCache();
  }
  observedSubjectId = nextSubjectId;
  emitSessionChange();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorageChange);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorageChange);
    }
  };
}

function getSnapshot(): StoredSession | null {
  const session = readStoredSession();
  observedSubjectId = session?.principal.subjectId ?? null;
  return session;
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
      /** Policy minimum shown on the forced-change screen. */
      readonly passwordMinLength: number;
    }
  | {
      readonly kind: "mfa_required";
      readonly mfaToken: string;
      /** The factors the account can present (absent = TOTP). */
      readonly methods?: readonly MfaMethod[];
    }
  | { readonly kind: "mfa_enrollment_required"; readonly mfaToken: string };

function storeSession(response: AuthenticationSessionResponse): void {
  const previousSubjectId = readStoredSession()?.principal.subjectId ?? null;
  const session = storedSessionFrom(response);
  if (previousSubjectId !== null && previousSubjectId !== session.principal.subjectId) {
    clearUserScopedCache();
  }
  writeStoredSession(session);
  observedSubjectId = session.principal.subjectId;
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
      passwordMinLength: response.passwordMinLength ?? fallbackMinimumPasswordLength,
    };
  }
  if (isMfaResponse(response)) {
    return response.status === "MFA_REQUIRED"
      ? { kind: "mfa_required", mfaToken: response.mfaToken, methods: response.methods }
      : { kind: "mfa_enrollment_required", mfaToken: response.mfaToken };
  }
  storeSession(response);
  return { kind: "authenticated" };
}

export function useSession() {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      rememberMe = false,
      captchaToken?: string,
    ): Promise<SignInOutcome> => {
      await waitForPendingLogout();
      const response = await loginWithPassword({
        email,
        password,
        rememberMe,
        ...(captchaToken === undefined ? {} : { captchaToken }),
      });
      // A local (break-glass) session never triggers Entra single logout.
      forgetEntraConfiguration();
      return toSignInOutcome(response);
    },
    [],
  );

  /** Microsoft ID token → application session. */
  const signInWithEntra = useCallback(async (idToken: string): Promise<void> => {
    await waitForPendingLogout();
    storeSession(await loginWithEntraIdToken(idToken));
  }, []);

  const completePasswordChange = useCallback(
    async (passwordChangeToken: string, newPassword: string): Promise<SignInOutcome> => {
      const response = await changePasswordOnFirstLogin({
        passwordChangeToken,
        newPassword,
      });
      return toSignInOutcome(response);
    },
    [],
  );

  /** TOTP or recovery code → session. */
  const completeMfa = useCallback(
    async (mfaToken: string, code: string, captchaToken?: string): Promise<void> => {
      storeSession(
        await verifyMfaCode({
          mfaToken,
          code,
          ...(captchaToken === undefined ? {} : { captchaToken }),
        }),
      );
    },
    [],
  );

  /** A verified passkey assertion → the same session as a code. */
  const completeMfaWithPasskey = useCallback(
    async (mfaToken: string, assertion: AuthenticationResponseJSON): Promise<void> => {
      storeSession(await completePasskeyLogin({ mfaToken, assertion }));
    },
    [],
  );

  /**
   * Forced enrollment. The session is held back until the user has
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
    // Revoke on the server too; the local sign-out
    // does not wait for it (offline sign-out must still work).
    if (readStoredSession() !== null) {
      beginServerLogout();
    }
    clearStoredSession();
    clearUserScopedCache();
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
    completeMfaWithPasskey,
    confirmMfaEnrollment,
    signOut,
  };
}
