import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiRequest } from "@/services/api";
import type { SessionPrincipal } from "@/services/session-store";

/** The session the API established. The token travels only in its HttpOnly cookie. */
export type AuthenticationSessionResponse = {
  readonly expiresInSeconds: number;
  readonly principal: SessionPrincipal;
};

/**
 * The public half of the human check. `none` — or a server
 * that does not send the field at all — means the sign-in page never shows a
 * challenge, exactly as before this package.
 */
export type CaptchaDescription = {
  readonly provider: "none" | "turnstile";
  readonly siteKey: string | null;
  readonly afterFailures: number;
};

export const captchaOff: CaptchaDescription = {
  provider: "none",
  siteKey: null,
  afterFailures: 5,
};

/** Used only when a server does not send the policy value. */
export const fallbackMinimumPasswordLength = 12;

export type MustChangePasswordLoginResponse = {
  readonly status: "MUST_CHANGE_PASSWORD";
  readonly passwordChangeToken: string;
  readonly expiresInSeconds: number;
  /** A temporary password or an expired one. */
  readonly reason?: "temporary" | "expired";
  /**
   * `private.auth.password.minLength`, so the forced-change
   * form states the rule the server enforces. Optional — a server that does not
   * send it falls back to the shipped minimum.
   */
  readonly passwordMinLength?: number;
};

/** Password accepted, second factor pending. */
export type MfaLoginResponse = {
  readonly status: "MFA_REQUIRED" | "MFA_ENROLLMENT_REQUIRED";
  readonly mfaToken: string;
  readonly expiresInSeconds: number;
  /**
   * The factors this account can present. Absent on an older
   * server, which means TOTP only — exactly the behaviour before passkeys.
   */
  readonly methods?: readonly MfaMethod[];
};

/** The two second factors a local account can present. */
export type MfaMethod = "totp" | "passkey";

export type AuthenticationLoginResponse =
  AuthenticationSessionResponse | MustChangePasswordLoginResponse | MfaLoginResponse;

export function isMfaResponse(response: AuthenticationLoginResponse): response is MfaLoginResponse {
  return (
    "status" in response &&
    (response.status === "MFA_REQUIRED" || response.status === "MFA_ENROLLMENT_REQUIRED")
  );
}

export function verifyMfaCode(input: {
  readonly mfaToken: string;
  readonly code: string;
  /** The solved challenge, when the server asked for one. */
  readonly captchaToken?: string;
}): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/mfa/verify", { method: "POST", body: JSON.stringify(input) });
}

/**
 * The passkey branch of the sign-in second factor. The mfa token
 * is not consumed until a factor verifies, so the person can switch between
 * "code" and "passkey" as long as it is valid.
 */
export function startPasskeyLogin(
  mfaToken: string,
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
  return apiRequest("/auth/mfa/passkey/start", {
    method: "POST",
    body: JSON.stringify({ mfaToken }),
  });
}

export function completePasskeyLogin(input: {
  readonly mfaToken: string;
  readonly assertion: AuthenticationResponseJSON;
}): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/mfa/passkey/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type MfaEnrollmentSecret = {
  readonly secret: string;
  readonly otpauthUri: string;
};

export function startSignInMfaEnrollment(mfaToken: string): Promise<MfaEnrollmentSecret> {
  return apiRequest("/auth/mfa/enroll/start", {
    method: "POST",
    body: JSON.stringify({ mfaToken }),
  });
}

export function confirmSignInMfaEnrollment(input: {
  readonly mfaToken: string;
  readonly code: string;
}): Promise<AuthenticationSessionResponse & { readonly recoveryCodes: readonly string[] }> {
  return apiRequest("/auth/mfa/enroll/confirm", { method: "POST", body: JSON.stringify(input) });
}

export function isMustChangePasswordResponse(
  response: AuthenticationLoginResponse,
): response is MustChangePasswordLoginResponse {
  return "status" in response && response.status === "MUST_CHANGE_PASSWORD";
}

export function loginWithPassword(input: {
  readonly email: string;
  readonly password: string;
  readonly rememberMe?: boolean;
  /** sent only once the page shows the Turnstile widget. */
  readonly captchaToken?: string;
}): Promise<AuthenticationLoginResponse> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function changePasswordOnFirstLogin(input: {
  readonly passwordChangeToken: string;
  readonly newPassword: string;
}): Promise<AuthenticationLoginResponse> {
  return apiRequest("/auth/change-password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.passwordChangeToken}`,
    },
    body: JSON.stringify({ newPassword: input.newPassword }),
  });
}

/** 1 h session, extended while the user is active. */
export function refreshSession(): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/refresh", { method: "POST" });
}

/** Server-side sign out (revokes the token); callers may abort a stalled request. */
export function logoutSession(signal?: AbortSignal): Promise<void> {
  return apiRequest("/auth/logout", { method: "POST", signal });
}

/** Which sign-in options the login page offers. */
export type AuthenticationProviders = {
  readonly mode: "local" | "entra_ad";
  readonly entra: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly authority: string;
    readonly singleLogout: boolean;
  } | null;
  /** absent on an older server, which means "no challenge". */
  readonly captcha?: CaptchaDescription;
};

export function getAuthenticationProviders(): Promise<AuthenticationProviders> {
  return apiRequest("/auth/providers");
}

/** Exchanges a Microsoft Entra ID token for an application session. */
export function loginWithEntraIdToken(idToken: string): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/entra", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}
