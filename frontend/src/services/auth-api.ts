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
