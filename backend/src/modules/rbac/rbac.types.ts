import type { PermissionCatalogEntry } from '../authorization/permission-catalog';
import type { ShadowAuthorizationReport } from '../authorization/shadow-authorization.types';

export type { PermissionCatalogEntry };

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
  /** Paket 5.1 (M4 B2): dokaz da je pregled urađen — obavezan na `PUT`. */
  readonly previewToken: string;
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
  /** Paket 5.1 (M4 B2): potpisan pregled uticaja za tačno ovaj skup permisija. */
  readonly previewToken: string;
  /** Paket 5.1 (M4 B2): razlog promjene (RAW `:223`), ≤ 500 znakova. */
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
};
