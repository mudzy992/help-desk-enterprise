import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  assetViewerFromContext,
  isPathInScope,
  resolveAssetScope,
  unitScopeWhere,
  viewerHasPermission,
  type AssetScope,
} from './asset-viewer';

/**
 * BA-changes-02 (W7.43), BA-problems-03 (W7.22): linking a CMDB item from
 * another module is a second authorization boundary. The module permission
 * (`change.request`, `problem.manage`, ...) never implies CMDB visibility: the
 * viewer also needs `asset.read` in the asset's organizational unit.
 *
 * The scope is resolved from the `asset.` permission prefix (not the owning
 * module's prefix), so a global `change.*` assignment does not widen the CMDB.
 */
export type AssetLinkAccess = {
  /** The viewer holds `asset.read` and its current OU scope. */
  readonly allowed: boolean;
  /** `null` = every unit; an impossible predicate when nothing is visible. */
  readonly where: Prisma.AssetWhereInput | null;
  /** The same decision for rows already in memory (`assetLinkVisible`). */
  readonly scope: AssetScope;
};

/** No unit in scope: an impossible predicate, never the NUL sentinel path. */
export const noVisibleAssets: Prisma.AssetWhereInput = { id: { in: [] } };

const denied: AssetLinkAccess = { allowed: false, where: noVisibleAssets, scope: { all: false, paths: [] } };

/**
 * Resolves the viewer's CMDB read scope. Missing or inactive principals fail
 * closed; a module manager without `asset.read` sees no asset at all.
 */
export async function assetLinkAccess(prisma: PrismaService, userId: string): Promise<AssetLinkAccess> {
  const principal = await loadPrincipalContext(prisma, userId);
  if (principal === null || !principal.isActive) return denied;
  const viewer = assetViewerFromContext(principal, userId, 'asset.');
  if (!viewerHasPermission(viewer, permissionKeys.assetRead)) return denied;
  const home = viewer.homeOrganizationalUnitId === null
    ? null
    : await prisma.organizationalUnit.findUnique({
        where: { id: viewer.homeOrganizationalUnitId },
        select: { ouPath: true },
      });
  const scope = resolveAssetScope(viewer, permissionKeys.assetRead, home?.ouPath ?? null);
  if (scope.all) return { allowed: true, where: null, scope };
  if (scope.paths.length === 0) return { allowed: true, where: noVisibleAssets, scope };
  return {
    allowed: true,
    where: { organizationalUnit: unitScopeWhere(scope) as Prisma.OrganizationalUnitWhereInput },
    scope,
  };
}

/** Asset filter for a scope; a denied viewer gets an impossible predicate. */
export function assetLinkWhere(access: AssetLinkAccess): Prisma.AssetWhereInput {
  return access.where ?? {};
}

/** In-memory twin of `assetLinkWhere` for already-loaded rows. */
export function assetLinkVisible(access: AssetLinkAccess, unitPath: string | null): boolean {
  return access.allowed && isPathInScope(access.scope, unitPath);
}
