import type { PrincipalAssignment, PrincipalContext } from '../../common/principal-context/principal-context.types';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

/** One permission grant of the viewer (from a role assignment). */
export type AssetGrant = {
  readonly permission: string;
  /** True only for an installation-wide assignment of a cross-unit role. */
  readonly global: boolean;
  /** Assignment unit path; null = falls back to the viewer's home unit. */
  readonly unitPath: string | null;
};

export type AssetViewer = {
  readonly userId: string;
  readonly isSuperAdmin: boolean;
  readonly homeOrganizationalUnitId: string | null;
  readonly grants: readonly AssetGrant[];
  /** True for ADMIN (and SUPER_ADMIN) assignments: 3.3 bypasses problem-group membership. */
  readonly isAdmin?: boolean;
};

/** Unit scope for a permission: every unit, a set of paths (with sub-units), or nothing. */
export type AssetScope = { readonly all: true } | { readonly all: false; readonly paths: readonly string[] };

const globalRoles = new Set<string>([authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin]);

/**
 * The raw OU/service columns remain part of the principal contract for older
 * synthetic contexts. They must agree that the assignment is unscoped before
 * its canonical scope can be treated as installation-wide.
 */
function assignmentHasGlobalScope(assignment: PrincipalAssignment): boolean {
  const hasNoScopeFields =
    assignment.organizationalUnitId === null &&
    assignment.organizationalUnitPath === null &&
    assignment.serviceId === null;
  return hasNoScopeFields && (assignment.scope === undefined || assignment.scope.kind === 'global');
}

/**
 * Builds the viewer from the principal context. `permissionPrefix` selects the
 * grants kept (3.3/3.4 reuse the same assignment-scope model for problems and
 * changes). Role names never widen a scoped assignment to installation-wide.
 */
export function assetViewerFromContext(context: PrincipalContext | null, userId: string, permissionPrefix = 'asset.'): AssetViewer {
  if (context === null) return { userId, isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
  const isSuperAdmin = context.assignments.some(
    (assignment) => assignment.roleKey === authorizationRoleKeys.superAdmin && assignmentHasGlobalScope(assignment),
  );
  const grants: AssetGrant[] = [];
  // These role capabilities are cross-unit only on an explicit global assignment.
  const canCrossUnits = (assignment: PrincipalAssignment) =>
    assignmentHasGlobalScope(assignment) &&
    (globalRoles.has(assignment.roleKey) ||
      (permissionPrefix === 'problem.' && assignment.roleKey === authorizationRoleKeys.problemManager) ||
      (permissionPrefix === 'change.' && assignment.roleKey === authorizationRoleKeys.changeManager));
  for (const assignment of context.assignments) {
    for (const permission of assignment.permissionKeys) {
      if (!permission.startsWith(permissionPrefix)) continue;
      grants.push({
        permission,
        global: canCrossUnits(assignment),
        unitPath: assignment.organizationalUnitPath,
      });
    }
  }
  const isAdmin = isSuperAdmin || context.assignments.some((assignment) => assignment.roleKey === authorizationRoleKeys.admin);
  return { userId, isSuperAdmin, homeOrganizationalUnitId: context.homeOrganizationalUnitId, grants, isAdmin };
}

export function assetViewerOf(request: AuthenticatedHttpRequest, userId: string): AssetViewer {
  return assetViewerFromContext(readPrincipalContext(request), userId);
}

export function viewerHasPermission(viewer: AssetViewer, permission: string): boolean {
  return viewer.isSuperAdmin || viewer.grants.some((grant) => grant.permission === permission);
}

/**
 * §14: the unit scope of a permission. An explicitly global role assignment
 * covers every unit; a scoped assignment covers its unit and sub-units; an
 * unscoped non-global assignment (the usual AGENT grant) falls back to the
 * viewer's home unit and sub-units.
 */
export function resolveAssetScope(viewer: AssetViewer, permission: string, homeUnitPath: string | null): AssetScope {
  if (viewer.isSuperAdmin) return { all: true };
  const grants = viewer.grants.filter((grant) => grant.permission === permission);
  if (grants.some((grant) => grant.global)) return { all: true };
  const paths = new Set<string>();
  for (const grant of grants) {
    const path = grant.unitPath ?? homeUnitPath;
    if (path !== null && path.trim().length > 0) paths.add(path.trim());
  }
  return { all: false, paths: [...paths] };
}

export function isPathInScope(scope: AssetScope, unitPath: string | null): boolean {
  if (scope.all) return true;
  if (unitPath === null) return false;
  return scope.paths.some((path) => unitPath === path || unitPath.startsWith(`${path}/`));
}

/** Prisma filter on `organizationalUnit` for a scope (null = no restriction). */
export function unitScopeWhere(scope: AssetScope): { ouPath: string } | { OR: object[] } | null {
  if (scope.all) return null;
  if (scope.paths.length === 0) return { ouPath: '\u0000no-scope' };
  return {
    OR: scope.paths.flatMap((path) => [{ ouPath: path }, { ouPath: { startsWith: `${path}/` } }]),
  };
}
