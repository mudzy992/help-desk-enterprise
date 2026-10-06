import { invalidateActorGroupsCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordGroupChange } from './record-group-change';
import { assertGroupDeletable } from './assert-group-deletable';
import { loadGroupRecord } from './load-group-record';
import type { GroupAuditContext } from './groups.types';

export type GroupDeleteOutcome = { readonly affectedUserIds: readonly string[] };

export async function deleteGroup(
  prisma: PrismaService,
  groupId: string,
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupDeleteOutcome> {
  const affectedUserIds = await prisma.$transaction(async (transaction) => {
    const client = transaction as unknown as PrismaService;
    const group = await loadGroupRecord(client, groupId);
    await assertGroupDeletable(client, group);
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
      },
    });
    await transaction.group.delete({ where: { id: groupId } });
    return memberUserIds;
  });
  invalidateActorGroupsCache();
  return { affectedUserIds };
}
