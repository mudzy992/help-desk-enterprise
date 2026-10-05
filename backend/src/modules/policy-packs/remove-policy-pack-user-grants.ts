import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackCatalogEnsureResult } from './ensure-policy-pack-catalog';
import type { PolicyPackPlannedAssignment } from './policy-pack.types';

export interface PolicyPackRemovedUserGrantCounts {
  readonly removedUserRoleCount: number;
  readonly affectedUserIds: readonly string[];
}

/**
 * M5 B5 (val 5): mirrors `applyPolicyPackUserGrants` — it removes exactly the
 * `UserRole` rows the plan says the pack wrote for this target: same user, same
 * role (resolved by the catalog, not by a nested relation filter), same OU and
 * same service. Nothing else is touched.
 */
export async function removePolicyPackUserGrants(
  prisma: PrismaService,
  catalog: PolicyPackCatalogEnsureResult,
  plannedAssignments: readonly PolicyPackPlannedAssignment[],
): Promise<PolicyPackRemovedUserGrantCounts> {
  let removedUserRoleCount = 0;
  const affectedUserIds = new Set<string>();
  for (const assignment of plannedAssignments) {
    const roleId = catalog.roleIdsByKey.get(assignment.roleKey);
    if (roleId === undefined) {
      continue;
    }
    const deleted = await prisma.userRole.deleteMany({
      where: {
        userId: assignment.userId,
        roleId,
        organizationalUnitId: assignment.organizationalUnitId,
        serviceId: assignment.serviceId,
      },
    });
    if (deleted.count === 0) {
      continue;
    }
    removedUserRoleCount += deleted.count;
    affectedUserIds.add(assignment.userId);
  }
  return {
    removedUserRoleCount,
    affectedUserIds: [...affectedUserIds].sort(),
  };
}
