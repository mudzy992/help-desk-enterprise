import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { assetViewerFromContext, resolveAssetScope, viewerHasPermission } from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { problemVisibilityWhere } from './problem-visibility';

/** Fresh problem.read scope for non-HTTP recipient/subject contexts. Missing or inactive fails closed. */
export async function problemPrincipalScope(prisma: PrismaService, userId: string): Promise<Prisma.ProblemWhereInput | null> {
  const principal = await loadPrincipalContext(prisma, userId);
  if (principal === null || !principal.isActive) return { id: { in: [] } };
  const viewer = assetViewerFromContext(principal, userId, 'problem.');
  if (!viewerHasPermission(viewer, permissionKeys.problemRead)) return { id: { in: [] } };
  const unit = viewer.homeOrganizationalUnitId === null ? null : await prisma.organizationalUnit.findUnique({
    where: { id: viewer.homeOrganizationalUnitId }, select: { ouPath: true },
  });
  return problemVisibilityWhere(resolveAssetScope(viewer, permissionKeys.problemRead, unit?.ouPath ?? null), userId);
}
