import { apiRequest } from "@/services/api";

export type RoleSummaryResponse = {
  readonly key: string;
  readonly name: string;
  readonly permissionCount: number;
};

export type ShadowAuthorizationReport = {
  readonly kind: "shadow";
  readonly isEnforcing: false;
  readonly decision: "ALLOW" | "DENY";
  readonly reason: string;
};

export type RolePermissionPreviewSample = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly permissionKey: string;
  readonly before: ShadowAuthorizationReport;
  readonly after: ShadowAuthorizationReport;
};

export type RolePermissionPreviewResponse = {
  readonly roleKey: string;
  readonly currentPermissionKeys: readonly string[];
  readonly proposedPermissionKeys: readonly string[];
  readonly addedPermissionKeys: readonly string[];
  readonly removedPermissionKeys: readonly string[];
  readonly affectedUserCount: number;
  readonly samples: readonly RolePermissionPreviewSample[];
};

export function listRoles(): Promise<readonly RoleSummaryResponse[]> {
  return apiRequest("/roles");
}

export function listPermissionCatalog(): Promise<readonly string[]> {
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
): Promise<readonly string[]> {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissionKeys }),
  });
}
