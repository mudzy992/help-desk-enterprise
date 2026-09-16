import type { ShadowAuthorizationReport } from '../authorization/shadow-authorization.types';

export type RoleSummaryResponse = {
  readonly key: string;
  readonly name: string;
  readonly permissionCount: number;
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

export type ReplaceRolePermissionsInput = {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
  readonly actorUserId: string | null;
  readonly requestId: string | null;
};
