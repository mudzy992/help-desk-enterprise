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
  /*
    W2.25 (`BA-groups-02`): the actor's `authzVersion` is bumped **inside** the
    transaction that adds the membership. Two consequences: the shared authorization
    cache key moves with the change (no window where the row is committed and the
    version is not), and the request path can prove a cached membership snapshot is
    fresh without any extra query. Only the pointer move and the socket notice are
    left for after the commit.
  */
  const { authzVersion } = await prisma.$transaction(async (transaction) => {
    await transaction.groupMember.create({ data: { groupId, userId } });
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupMemberAdded,
      entityId: groupId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: { userId, membership: 'added' },
    });
    const updated = await transaction.user.update({
      where: { id: userId },
      data: { authzVersion: { increment: 1 } },
      select: { authzVersion: true },
    });
    return { authzVersion: updated.authzVersion };
  });
  invalidateActorGroupsCache();
  await invalidatePrincipal(userId, authzVersion);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
