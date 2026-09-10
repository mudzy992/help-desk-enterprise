import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackCatalogEnsureResult } from './ensure-policy-pack-catalog';
import type { PolicyPackPlannedAssignment } from './policy-pack.types';

export async function applyPolicyPackUserGrants(
  prisma: PrismaService,
  catalog: PolicyPackCatalogEnsureResult,
  plannedAssignments: readonly PolicyPackPlannedAssignment[],
): Promise<{ createdUserRoleCount: number; existingUserRoleCount: number }> {
  let createdUserRoleCount = 0;
  let existingUserRoleCount = 0;
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
  }
  return { createdUserRoleCount, existingUserRoleCount };
}
