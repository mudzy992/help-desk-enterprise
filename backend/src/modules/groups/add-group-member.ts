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

export async function addGroupMember(
  prisma: PrismaService,
  groupId: string,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
  context: GroupAuditContext = { actorUserId: null, requestId: null },
): Promise<GroupResponse> {
  const group = await loadGroupRecord(prisma, groupId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user === null) {
    throw new GroupsError('USER_NOT_FOUND');
  }
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (existing !== null) {
    throw new GroupsError('MEMBER_ALREADY_EXISTS');
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.groupMember.create({ data: { groupId, userId } });
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupMemberAdded,
      entityId: groupId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: { userId, membership: 'added' },
    });
  });
  invalidateActorGroupsCache();
  await invalidatePrincipal(userId);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
