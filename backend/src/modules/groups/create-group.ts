import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { assertOrganizationalUnitExists } from './assert-organizational-unit-exists';
import { clearFallbackForOrganizationalUnit } from './clear-fallback-for-organizational-unit';
import { generateGroupKey } from './generate-group-key';
import type { CreateGroupInput, GroupAuditContext, GroupResponse } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { normalizeGroupName } from './normalize-group-name';
import { recordGroupChange } from './record-group-change';
import { toGroupResponse } from './to-group-response';

export async function createGroup(
  prisma: PrismaService,
  input: CreateGroupInput,
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupResponse> {
  const name = normalizeGroupName(input.name);
  await assertOrganizationalUnitExists(prisma, input.organizationalUnitId);
  const key = await generateGroupKey(prisma, name);
  const isFallback = input.isFallback ?? false;
  const createdId = await prisma.$transaction(async (transaction) => {
    if (isFallback) {
      const previous = await transaction.group.findMany({
        where: { organizationalUnitId: input.organizationalUnitId, isFallback: true },
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
      await clearFallbackForOrganizationalUnit(transaction as PrismaService, input.organizationalUnitId);
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
            replacementGroupKey: key,
          },
        });
      }
    }
    const group = await transaction.group.create({
      data: {
        name,
        key,
        organizationalUnitId: input.organizationalUnitId,
        isFallback,
        isProblemGroup: input.isProblemGroup ?? false,
        isCabGroup: input.isCabGroup ?? false,
      },
    });
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupCreated,
      entityId: group.id,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: {
        after: {
          name: group.name,
          key: group.key,
          organizationalUnitId: group.organizationalUnitId,
          isFallback: group.isFallback,
          isProblemGroup: group.isProblemGroup,
          isCabGroup: group.isCabGroup,
        },
      },
    });
    return group.id;
  });
  return toGroupResponse(await loadGroupRecord(prisma, createdId));
}
