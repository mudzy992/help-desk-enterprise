import type { PermissionCatalogEntry } from '../authorization/permission-catalog';
import type { ShadowAuthorizationReport } from '../authorization/shadow-authorization.types';

export type { PermissionCatalogEntry };

export type RoleSummaryResponse = {
  readonly key: string;
  readonly name: string;
  readonly permissionCount: number;
};

/**
 * W2.31 (`BA-rbac-03`): the impact of a role change depends on *where* the
 * assignment lives. The same permission removal is global for an unscoped
 * assignment, subtree-wide for an OU-scoped one and service-wide for one scoped
 * to a service, so every sample names the scope it was evaluated in.
 */
export const rolePermissionPreviewScopeKinds = {
  global: 'global',
  organizationalUnit: 'organizational-unit',
  service: 'service',
  organizationalUnitAndService: 'organizational-unit-and-service',
} as const;

export type RolePermissionPreviewScopeKind =
  (typeof rolePermissionPreviewScopeKinds)[keyof typeof rolePermissionPreviewScopeKinds];

export type RolePermissionPreviewScope = {
  readonly kind: RolePermissionPreviewScopeKind;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
};

export type RolePermissionPreviewSample = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  /** The assignment the decision was evaluated through. */
  readonly assignmentId: string;
  readonly permissionKey: string;
  readonly scope: RolePermissionPreviewScope;
  readonly before: ShadowAuthorizationReport;
  readonly after: ShadowAuthorizationReport;
};

/** Number of changed decisions per scope kind (not limited to the 3 samples). */
export type RolePermissionPreviewScopeImpacts = {
  readonly [Kind in RolePermissionPreviewScopeKind]: number;
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
  /** W2.31 (`BA-rbac-03`): global vs OU vs service effect, counted before sampling. */
  readonly scopeImpacts: RolePermissionPreviewScopeImpacts;
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
