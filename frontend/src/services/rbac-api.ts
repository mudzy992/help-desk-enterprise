import { apiRequest } from "@/services/api";

export type RoleSummaryResponse = {
  readonly key: string;
  readonly name: string;
  readonly permissionCount: number;
};

export type PermissionCatalogEntry = {
  readonly key: string;
  readonly description: string;
  readonly categoryId: string;
};

export type ShadowAuthorizationReport = {
  readonly kind: "shadow";
  readonly isEnforcing: false;
  readonly decision: "ALLOW" | "DENY";
  readonly reason: string;
};

/// W2.31 (`BA-rbac-03`): every sample names the scope the decision was made in.
export type RolePermissionPreviewScopeKind =
  | "global"
  | "organizational-unit"
  | "service"
  | "organizational-unit-and-service";

export type RolePermissionPreviewScope = {
  readonly kind: RolePermissionPreviewScopeKind;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
};

export type RolePermissionPreviewScopeImpacts = {
  readonly global: number;
  readonly "organizational-unit": number;
  readonly service: number;
  readonly "organizational-unit-and-service": number;
};

export type RolePermissionPreviewSample = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly assignmentId: string;
  readonly permissionKey: string;
  readonly scope: RolePermissionPreviewScope;
  readonly before: ShadowAuthorizationReport;
  readonly after: ShadowAuthorizationReport;
};

export type RolePermissionPreviewResponse = {
  /**
   * Paket 5.1 (M4 B2): the server refuses to save without this token, and it is
   * only valid for the reviewed set of permissions (15 minutes).
   */
  readonly previewToken: string;
  readonly roleKey: string;
  readonly currentPermissionKeys: readonly string[];
  readonly proposedPermissionKeys: readonly string[];
  readonly addedPermissionKeys: readonly string[];
  readonly removedPermissionKeys: readonly string[];
  readonly affectedUserCount: number;
  /** W2.31 (`BA-rbac-03`): global vs OU vs service effect, counted before sampling. */
  readonly scopeImpacts: RolePermissionPreviewScopeImpacts;
  readonly samples: readonly RolePermissionPreviewSample[];
};

export function listRoles(): Promise<readonly RoleSummaryResponse[]> {
  return apiRequest("/roles");
}

export function listPermissionCatalog(): Promise<readonly PermissionCatalogEntry[]> {
  return apiRequest("/roles/permissions/catalog");
}

export function getRolePermissions(roleKey: string): Promise<readonly string[]> {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}/permissions`);
}

export function previewRolePermissions(
  roleKey: string,
  permissionKeys: readonly string[],
): Promise<RolePermissionPreviewResponse> {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}/permissions/preview`, {
    method: "POST",
    body: JSON.stringify({ permissionKeys }),
  });
}

export function replaceRolePermissions(
  roleKey: string,
  permissionKeys: readonly string[],
  previewToken: string,
  reason: string,
): Promise<readonly string[]> {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissionKeys, previewToken, reason }),
  });
}
