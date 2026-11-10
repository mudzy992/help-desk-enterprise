import { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { applyPolicyPackServicePolicy } from './apply-policy-pack-service-policy';
import { applyPolicyPackUserGrants } from './apply-policy-pack-user-grants';
import { bindPolicyPackTargets } from './bind-policy-pack-targets';
import { ensurePolicyPackCatalog } from './ensure-policy-pack-catalog';
import { planPolicyPackAssignments } from './plan-policy-pack-apply';
import { planPolicyPackServicePolicy } from './plan-policy-pack-service-policy';
import { resolvePolicyPackApplyTarget } from './resolve-policy-pack-apply-target';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyResult,
  PrincipalInvalidationHook,
} from './policy-pack.types';

export async function applyPolicyPack(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
  actor: {
    readonly actorUserId: string | null;
    readonly requestId: string | null;
  } = { actorUserId: null, requestId: null },
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<PolicyPackApplyResult> {
  const target = await resolvePolicyPackApplyTarget(prisma, input);
  const plannedAssignments = planPolicyPackAssignments(target);
  const servicePolicyPlan = await planPolicyPackServicePolicy(prisma, target);
  // Phase 2.2: collected inside the transaction, used after it commits. Kept out
  // of the response: the client has no business with the invalidation bookkeeping.
  let affectedUserIds: readonly string[] = [];
  const result = await prisma.$transaction(async (transaction) => {
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
    affectedUserIds = userGrants.affectedUserIds;
    const servicePolicy =
      servicePolicyPlan.plan === null
        ? null
        : await applyPolicyPackServicePolicy(
            transaction as PrismaService,
            target,
            servicePolicyPlan.plan,
            servicePolicyPlan.slaProfileId,
          );
    await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.policyPackApply,
      entityType: auditLogEntityTypes.policyPack,
      entityId: target.pack.key,
      metadata: {
        packKey: target.pack.key,
        serviceId: target.serviceId,
        createdRolePermissionCount: catalog.createdRolePermissionCount,
        createdUserRoleCount: userGrants.createdUserRoleCount,
        // M5 B1: what the bundle part replaced on the service, so the old
        // values are not lost when apply overwrites them.
        ...(servicePolicy === null
          ? {}
          : {
              servicePolicyBefore: servicePolicy.before,
              servicePolicyAfter: {
                classification: servicePolicy.plan.classification,
                requiresApproval: servicePolicy.plan.requiresApproval,
                slaProfileId: servicePolicyPlan.slaProfileId,
              },
            }),
      },
      actorUserId: actor.actorUserId,
      requestId: actor.requestId,
      organizationalUnitId: target.organizationalUnitId,
    });
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
      servicePolicy: servicePolicyPlan.plan,
      plannedAssignments,
    };
  });
  // Phase 2.2: only now that the grants are committed. Every user whose
  // authorization data actually changed gets a fresh entry on the next request.
  for (const userId of affectedUserIds) {
    await invalidatePrincipal(userId);
  }
  return result;
}
