import { apiRequest } from "@/services/api";
import type { SessionPrincipal } from "@/services/session-store";

export type AuthenticationSessionResponse = {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresInSeconds: number;
  readonly principal: SessionPrincipal;
};

export type MustChangePasswordLoginResponse = {
  readonly status: "MUST_CHANGE_PASSWORD";
  readonly passwordChangeToken: string;
  readonly expiresInSeconds: number;
};

export type AuthenticationLoginResponse =
  | AuthenticationSessionResponse
  | MustChangePasswordLoginResponse;

export function isMustChangePasswordResponse(
  response: AuthenticationLoginResponse,
): response is MustChangePasswordLoginResponse {
  return "status" in response && response.status === "MUST_CHANGE_PASSWORD";
}

export function loginWithPassword(input: {
  readonly email: string;
  readonly password: string;
}): Promise<AuthenticationLoginResponse> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function changePasswordOnFirstLogin(input: {
  readonly passwordChangeToken: string;
  readonly newPassword: string;
}): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/change-password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.passwordChangeToken}`,
    },
    body: JSON.stringify({ newPassword: input.newPassword }),
  });
}

/** Review 2026-09-25: 1 h session, extended while the user is active. */
export function refreshSession(): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/refresh", { method: "POST" });
}

/** Server-side sign out (revokes the token); failures are ignored by callers. */
export function logoutSession(): Promise<void> {
  return apiRequest("/auth/logout", { method: "POST" });
}

/** Paket 1.8 (A1): which sign-in options the login page offers. */
export type AuthenticationProviders = {
  readonly mode: "local" | "entra_ad";
  readonly entra: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly authority: string;
    readonly singleLogout: boolean;
  } | null;
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
