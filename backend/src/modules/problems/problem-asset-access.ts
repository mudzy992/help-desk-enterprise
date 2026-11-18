import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { assetLinkAccess, noVisibleAssets } from '../assets/asset-link-access';

export type ProblemAssetAccess = {
  /** The viewer holds `asset.read` and its current OU scope. */
  readonly allowed: boolean;
  /** `null` means every unit; a denied viewer never reaches it. */
  readonly where: Prisma.AssetWhereInput | null;
};

/**
 * BA-problems-03 (W7.22): the CMDB link pickers and the linked-asset read are
 * a second authorization boundary. A problem manager inside `problem.manage`
 * still needs `asset.read` in the asset's OU, so the problem module never
 * widens CMDB visibility. Missing or inactive principals fail closed.
 *
 * The scope uses the `asset.` permission prefix (not `problem.`), so a global
 * problem-manager assignment does not become a global CMDB grant.
 *
 * W7.43: the decision lives in `assets/asset-link-access.ts` so the change
 * module (BA-changes-02) applies exactly the same rule.
 */
export async function problemAssetAccess(prisma: PrismaService, userId: string): Promise<ProblemAssetAccess> {
  const access = await assetLinkAccess(prisma, userId);
  return access.allowed ? { allowed: true, where: access.where } : { allowed: false, where: null };
}

/** Asset filter for a scope; a denied viewer gets an impossible predicate. */
export function assetWhereOf(access: ProblemAssetAccess): Prisma.AssetWhereInput {
  if (!access.allowed) return noVisibleAssets;
  return access.where ?? {};
}
