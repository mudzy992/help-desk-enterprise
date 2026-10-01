import { apiRequest } from "@/services/api";
import type { SessionPrincipal } from "@/services/session-store";

export type CurrentSessionResponse = {
  readonly principal: SessionPrincipal;
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  /** Paket 3.2: optional modules that are switched on (menus only). */
  readonly modules?: { readonly cmdb: boolean; readonly problems?: boolean; readonly changes?: boolean };
};

export function getCurrentSession(): Promise<CurrentSessionResponse> {
  return apiRequest("/auth/session");
}
