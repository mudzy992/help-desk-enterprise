import { PrismaService } from '../../common/prisma/prisma.service';
import { applyPolicyPackUserGrants } from './apply-policy-pack-user-grants';
import { bindPolicyPackTargets } from './bind-policy-pack-targets';
import { ensurePolicyPackCatalog } from './ensure-policy-pack-catalog';
import { planPolicyPackAssignments } from './plan-policy-pack-apply';
import { resolvePolicyPackApplyTarget } from './resolve-policy-pack-apply-target';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyResult,
} from './policy-pack.types';

export async function applyPolicyPack(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyResult> {
  const target = await resolvePolicyPackApplyTarget(prisma, input);
  const plannedAssignments = planPolicyPackAssignments(target);
  return prisma.$transaction(async (transaction) => {
    const catalog = await ensurePolicyPackCatalog(transaction as PrismaService, target.pack);
    await bindPolicyPackTargets(
      transaction as PrismaService,
      catalog.policyPackId,
      target,
    );
    const userGrants = await applyPolicyPackUserGrants(
      transaction as PrismaService,
      catalog,
      plannedAssignments,
    );
    return {
      packKey: target.pack.key,
      name: target.pack.name,
      organizationalUnitId: target.organizationalUnitId,
      serviceId: target.serviceId,
      userIds: target.userIds,
      createdUserRoleCount: userGrants.createdUserRoleCount,
      existingUserRoleCount: userGrants.existingUserRoleCount,
      createdRolePermissionCount: catalog.createdRolePermissionCount,
      existingRolePermissionCount: catalog.existingRolePermissionCount,
      plannedAssignments,
    };
  });
}
