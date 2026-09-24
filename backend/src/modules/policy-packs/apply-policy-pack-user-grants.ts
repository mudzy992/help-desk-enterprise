import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackCatalogEnsureResult } from './ensure-policy-pack-catalog';
import type { PolicyPackPlannedAssignment } from './policy-pack.types';

export interface PolicyPackUserGrantCounts {
  readonly createdUserRoleCount: number;
  readonly existingUserRoleCount: number;
  /**
   * Phase 2.2: users whose authorization data changed. The caller invalidates
   * them *after* the surrounding transaction commits — invalidating inside it
   * could let a concurrent read refill the cache with pre-commit data.
   */
  readonly affectedUserIds: readonly string[];
}

export async function applyPolicyPackUserGrants(
  prisma: PrismaService,
  catalog: PolicyPackCatalogEnsureResult,
  plannedAssignments: readonly PolicyPackPlannedAssignment[],
): Promise<PolicyPackUserGrantCounts> {
  let createdUserRoleCount = 0;
  let existingUserRoleCount = 0;
  const affectedUserIds = new Set<string>();
  for (const assignment of plannedAssignments) {
    const roleId = catalog.roleIdsByKey.get(assignment.roleKey);
    if (roleId === undefined) {
      continue;
    }
    const existing = await prisma.userRole.findFirst({
      where: {
        userId: assignment.userId,
        roleId,
        organizationalUnitId: assignment.organizationalUnitId,
        serviceId: assignment.serviceId,
      },
      select: { id: true },
    });
    if (existing !== null) {
      existingUserRoleCount += 1;
      continue;
    }
    await prisma.userRole.create({
      data: {
        userId: assignment.userId,
        roleId,
        organizationalUnitId: assignment.organizationalUnitId,
        serviceId: assignment.serviceId,
      },
    });
    createdUserRoleCount += 1;
    affectedUserIds.add(assignment.userId);
  }
  return {
    createdUserRoleCount,
    existingUserRoleCount,
    affectedUserIds: [...affectedUserIds].sort(),
  };
}
