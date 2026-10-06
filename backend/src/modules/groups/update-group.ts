import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import type { GroupAuditContext, GroupResponse, UpdateGroupInput } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { normalizeGroupName } from './normalize-group-name';
import { recordGroupChange } from './record-group-change';
import { toGroupResponse } from './to-group-response';

export async function updateGroup(
  prisma: PrismaService,
  groupId: string,
  input: UpdateGroupInput,
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupResponse> {
  const current = await loadGroupRecord(prisma, groupId);
  const name = input.name === undefined ? current.name : normalizeGroupName(input.name);
  const isFallback = input.isFallback === undefined ? current.isFallback : input.isFallback;
  const isProblemGroup = input.isProblemGroup ?? current.isProblemGroup;
  const isCabGroup = input.isCabGroup ?? current.isCabGroup;
  const beforeGroup = {
    name: current.name,
    isFallback: current.isFallback,
    isProblemGroup: current.isProblemGroup,
    isCabGroup: current.isCabGroup,
  };
  const afterGroup = { name, isFallback, isProblemGroup, isCabGroup };
  const changedFields = (Object.keys(afterGroup) as (keyof typeof afterGroup)[])
    .filter((field) => beforeGroup[field] !== afterGroup[field]);

  await prisma.$transaction(async (transaction) => {
    if (isFallback && !current.isFallback) {
      const previous = await transaction.group.findMany({
        where: {
          organizationalUnitId: current.organizationalUnitId,
          isFallback: true,
          id: { not: groupId },
        },
        select: {
          id: true,
          name: true,
          key: true,
          organizationalUnitId: true,
          isFallback: true,
          isProblemGroup: true,
          isCabGroup: true,
        },
      });
      await clearFallbackForOrganizationalUnit(
        transaction as PrismaService,
        current.organizationalUnitId,
        groupId,
      );
      for (const group of previous) {
        await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
          action: auditLogActions.groupUpdated,
          entityId: group.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          organizationalUnitId: group.organizationalUnitId,
          metadata: {
            reason: 'fallback_reassigned',
            before: { isFallback: true },
            after: { isFallback: false },
            replacementGroupId: groupId,
          },
        });
      }
    }
    const updated = await transaction.group.update({
      where: { id: groupId },
      data: { name, isFallback, isProblemGroup, isCabGroup },
    });
    if (changedFields.length > 0) {
      await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.groupUpdated,
        entityId: groupId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        organizationalUnitId: updated.organizationalUnitId,
        metadata: {
          before: Object.fromEntries(changedFields.map((field) => [field, beforeGroup[field]])),
          after: Object.fromEntries(changedFields.map((field) => [field, afterGroup[field]])),
        },
      });
    }
  });
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
