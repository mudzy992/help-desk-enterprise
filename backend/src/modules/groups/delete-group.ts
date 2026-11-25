import { invalidateActorGroupsCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordGroupChange } from './record-group-change';
import { assertGroupDeletable } from './assert-group-deletable';
import { loadGroupRecord } from './load-group-record';
import type { GroupAuditContext } from './groups.types';
import type { GroupDeleteImpact } from './group-delete.types';
import { withGroupFallbackLock } from './with-group-fallback-lock';

export type GroupDeleteOutcome = {
  readonly affectedUserIds: readonly string[];
  /** Captured from the deleted record inside the committing transaction. */
  readonly organizationalUnitId: string;
  /** W2.12: what the delete detached or cascade-deleted, for the audit trail. */
  readonly impact: GroupDeleteImpact;
};

export async function deleteGroup(
  prisma: PrismaService,
  groupId: string,
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupDeleteOutcome> {
  const outcome = await prisma.$transaction(async (transaction) => {
    const client = transaction as unknown as PrismaService;
    const group = await loadGroupRecord(client, groupId);
    // W2.13 (`BA-groups-03`): the inventory counts fallback groups, so deleting a
    // fallback group takes the same per-unit lock as setting one. Without it a
    // concurrent `PATCH isFallback=false` and a delete could each see the other
    // group and both proceed, leaving the unit with none.
    const impact = await withGroupFallbackLock(client, group.organizationalUnitId, () =>
      assertGroupDeletable(client, group),
    );
    const memberUserIds = group.members.map((member) => member.userId);
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupDeleted,
      entityId: group.id,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: {
        before: {
          name: group.name,
          key: group.key,
          organizationalUnitId: group.organizationalUnitId,
          isFallback: group.isFallback,
          isProblemGroup: group.isProblemGroup,
          isCabGroup: group.isCabGroup,
          memberCount: memberUserIds.length,
          memberUserIds,
        },
        // W2.12: the audit answers "what disappeared with this group?" without a
        // database archaeology session afterwards.
        dependencies: {
          blocked: [] as readonly { kind: string; count: number }[],
          detached: impact.detached,
          cascaded: impact.cascaded,
        },
      },
    });
    await transaction.group.delete({ where: { id: groupId } });
    return {
      affectedUserIds: memberUserIds,
      organizationalUnitId: group.organizationalUnitId,
      impact,
    };
  });
  invalidateActorGroupsCache();
  return outcome;
}
