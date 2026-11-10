import { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { ensurePolicyPackCatalog } from './ensure-policy-pack-catalog';
import { planPolicyPackAssignments } from './plan-policy-pack-apply';
import { removePolicyPackUserGrants } from './remove-policy-pack-user-grants';
import { resolvePolicyPackUnapplyTarget } from './resolve-policy-pack-apply-target';
import { unbindPolicyPackTargets } from './unbind-policy-pack-targets';
import type {
  PolicyPackApplyInput,
  PolicyPackUnapplyResult,
  PrincipalInvalidationHook,
} from './policy-pack.types';

/**
 * M5 B5 (val 5): the reverse of `applyPolicyPack`, on purpose narrow.
 *
 * Removes: the `UserRole` rows the pack's plan wrote for this target, and the
 * pack link on the OU/service *if* it points at this pack.
 * Keeps: roles and their permissions. They are global rows shared by every
 * other target the same pack (or another pack) has touched, so deleting them
 * here would be an invisible change for unrelated users — the docs say so.
 */
export async function unapplyPolicyPack(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
  actor: {
    readonly actorUserId: string | null;
    readonly requestId: string | null;
  } = { actorUserId: null, requestId: null },
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<PolicyPackUnapplyResult> {
  const target = await resolvePolicyPackUnapplyTarget(prisma, input);
  const plannedAssignments = planPolicyPackAssignments(target);
  let affectedUserIds: readonly string[] = [];
  const result = await prisma.$transaction(async (transaction) => {
    const catalog = await ensurePolicyPackCatalog(
      transaction as PrismaService,
      target.pack,
    );
    const removed = await removePolicyPackUserGrants(
      transaction as PrismaService,
      catalog,
      plannedAssignments,
    );
    const unbind = await unbindPolicyPackTargets(
      transaction as PrismaService,
      catalog.policyPackId,
      target,
    );
    affectedUserIds = removed.affectedUserIds;
    await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.policyPackUnapply,
      entityType: auditLogEntityTypes.policyPack,
      entityId: target.pack.key,
      metadata: {
        packKey: target.pack.key,
        serviceId: target.serviceId,
        removedUserRoleCount: removed.removedUserRoleCount,
        unboundOrganizationalUnit: unbind.unboundOrganizationalUnit,
        unboundService: unbind.unboundService,
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
      removedUserRoleCount: removed.removedUserRoleCount,
      unboundOrganizationalUnit: unbind.unboundOrganizationalUnit,
      unboundService: unbind.unboundService,
      plannedAssignments,
    };
  });
  for (const userId of affectedUserIds) {
    await invalidatePrincipal(userId);
  }
  return result;
}
