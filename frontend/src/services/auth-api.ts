import { apiRequest } from "@/services/api";
import type { SessionPrincipal } from "@/services/session-store";

export type AuthenticationSessionResponse = {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresInSeconds: number;
  readonly principal: SessionPrincipal;
};

export function loginWithPassword(input: {
  readonly email: string;
  readonly password: string;
}): Promise<AuthenticationSessionResponse> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
