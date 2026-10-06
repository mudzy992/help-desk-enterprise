import { invalidateActorGroupsCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { GroupsError } from './groups.error';
import type { GroupAuditContext, PrincipalInvalidationHook } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { recordGroupChange } from './record-group-change';
import type { GroupResponse } from './groups.types';
import { toGroupResponse } from './to-group-response';

export async function removeGroupMember(
  prisma: PrismaService,
  groupId: string,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupResponse> {
  const group = await loadGroupRecord(prisma, groupId);
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (existing === null) {
    throw new GroupsError('MEMBER_NOT_FOUND');
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.groupMember.delete({ where: { id: existing.id } });
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupMemberRemoved,
      entityId: groupId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: { userId, membership: 'removed' },
    });
  });
  invalidateActorGroupsCache();
  await invalidatePrincipal(userId);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
