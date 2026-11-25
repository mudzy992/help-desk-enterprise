import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { assertFallbackRemovalAllowed } from './assert-fallback-removal-allowed';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import type { GroupAuditContext, GroupResponse, UpdateGroupInput } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { normalizeGroupName } from './normalize-group-name';
import { recordGroupChange } from './record-group-change';
import { toGroupResponse } from './to-group-response';
import { withGroupFallbackLock } from './with-group-fallback-lock';

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
  const changedFields = (Object.keys(afterGroup) as (keyof typeof afterGroup)[]).filter(
    (field) => beforeGroup[field] !== afterGroup[field],
  );

  await prisma.$transaction(async (transaction) => {
    const client = transaction as unknown as PrismaService;
    const updateInsideTransaction = async (): Promise<void> => {
      if (isFallback && !current.isFallback) {
        const previous = await client.group.findMany({
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
        await clearFallbackForOrganizationalUnit(client, current.organizationalUnitId, groupId);
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
      const updated = await client.group.update({
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
    };

    if (isFallback === current.isFallback) {
      await updateInsideTransaction();
      return;
    }
    // W2.13 (`BA-groups-03`): only a flag toggle touches the invariant, so only a
    // toggle pays for the lock. Turning the flag on is a replace (the previous
    // fallback is released in the same locked transaction); turning it off is
    // refused when it would leave the unit without a fallback.
    await withGroupFallbackLock(client, current.organizationalUnitId, async () => {
      if (!isFallback) {
        await assertFallbackRemovalAllowed(client, {
          groupId,
          organizationalUnitId: current.organizationalUnitId,
        });
      }
      await updateInsideTransaction();
    });
  });
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
