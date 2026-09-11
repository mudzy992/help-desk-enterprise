import { apiRequest } from "@/services/api";
import type { SessionPrincipal } from "@/services/session-store";

export type CurrentSessionResponse = {
  readonly principal: SessionPrincipal;
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
};

export function getCurrentSession(): Promise<CurrentSessionResponse> {
  return apiRequest("/auth/session");
}
