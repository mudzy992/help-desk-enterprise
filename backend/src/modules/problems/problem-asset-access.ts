import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import {
  assetViewerFromContext,
  resolveAssetScope,
  unitScopeWhere,
  viewerHasPermission,
} from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';

export type ProblemAssetAccess = {
  /** The viewer holds `asset.read` and its current OU scope. */
  readonly allowed: boolean;
  /** `null` means every unit; a denied viewer never reaches it. */
  readonly where: Prisma.AssetWhereInput | null;
};

const denied: ProblemAssetAccess = { allowed: false, where: null };
/** No unit in scope: an impossible predicate, never the NUL sentinel path. */
const noUnits: Prisma.AssetWhereInput = { id: { in: [] } };

/**
 * BA-problems-03 (W7.22): the CMDB link pickers and the linked-asset read are
 * a second authorization boundary. A problem manager inside `problem.manage`
 * still needs `asset.read` in the asset's OU, so the problem module never
 * widens CMDB visibility. Missing or inactive principals fail closed.
 *
 * The scope uses the `asset.` permission prefix (not `problem.`), so a global
 * problem-manager assignment does not become a global CMDB grant.
 */
export async function problemAssetAccess(prisma: PrismaService, userId: string): Promise<ProblemAssetAccess> {
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
  if (scope.all) return { allowed: true, where: null };
  if (scope.paths.length === 0) return { allowed: true, where: noUnits };
  const unitWhere = unitScopeWhere(scope);
  return {
    allowed: true,
    where: { organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput },
  };
}

/** Asset filter for a scope; a denied viewer gets an impossible predicate. */
export function assetWhereOf(access: ProblemAssetAccess): Prisma.AssetWhereInput {
  if (!access.allowed) return noUnits;
  return access.where ?? {};
}
