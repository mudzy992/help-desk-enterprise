import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

/** One permission grant of the viewer (from a role assignment). */
export type AssetGrant = {
  readonly permission: string;
  /** ADMIN / SUPER_ADMIN assignments cover every unit (§14). */
  readonly global: boolean;
  /** Assignment unit path; null = falls back to the viewer's home unit. */
  readonly unitPath: string | null;
};

export type AssetViewer = {
  readonly userId: string;
  readonly isSuperAdmin: boolean;
  readonly homeOrganizationalUnitId: string | null;
  readonly grants: readonly AssetGrant[];
};

/** Unit scope for a permission: every unit, a set of paths (with sub-units), or nothing. */
export type AssetScope = { readonly all: true } | { readonly all: false; readonly paths: readonly string[] };

const globalRoles = new Set<string>([authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin]);

export function assetViewerFromContext(context: PrincipalContext | null, userId: string): AssetViewer {
  if (context === null) return { userId, isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
  const isSuperAdmin =
    context.roleKeys.includes(authorizationRoleKeys.superAdmin) ||
    context.assignments.some((assignment) => assignment.roleKey === authorizationRoleKeys.superAdmin);
  const grants: AssetGrant[] = [];
  for (const assignment of context.assignments) {
    for (const permission of assignment.permissionKeys) {
      if (!permission.startsWith('asset.')) continue;
      grants.push({
        permission,
        global: globalRoles.has(assignment.roleKey),
        unitPath: assignment.organizationalUnitPath,
      });
    }
  }
  return { userId, isSuperAdmin, homeOrganizationalUnitId: context.homeOrganizationalUnitId, grants };
}

export function assetViewerOf(request: AuthenticatedHttpRequest, userId: string): AssetViewer {
  return assetViewerFromContext(readPrincipalContext(request), userId);
}

export function viewerHasPermission(viewer: AssetViewer, permission: string): boolean {
  return viewer.isSuperAdmin || viewer.grants.some((grant) => grant.permission === permission);
}

/**
 * §14: the unit scope of a permission. ADMIN/SUPER_ADMIN cover everything; a
 * scoped assignment covers its unit and sub-units; an assignment without a
 * unit (the usual AGENT grant) covers the viewer's home unit and sub-units.
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
