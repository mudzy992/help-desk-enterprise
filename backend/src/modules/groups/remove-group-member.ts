import { invalidateActorGroupsCache } from '../../common/cache/scope-catalog-cache';
import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { enqueueGroupRoomRevoke } from './group-room-revoke.outbox';
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
  /**
   * W2.25: when present, the intent to drop this subject from `group:<id>` on
   * every socket instance is committed **with** the deletion (durable, retried).
   */
  outbox?: Pick<TransactionalOutboxService, 'enqueue'>,
): Promise<GroupResponse> {
  const group = await loadGroupRecord(prisma, groupId);
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (existing === null) {
    throw new GroupsError('MEMBER_NOT_FOUND');
  }
  /*
    W2.25 (`BA-groups-02`): the deletion, the actor's `authzVersion` bump and the
    intent to drop the group room commit together. A crash after this commit
    therefore cannot leave the revoke undone *or* unnotified: the room event is a
    row, and the version is what makes the next HTTP request on any instance see the
    new membership instead of a 30-second-old snapshot.
  */
  const { authzVersion } = await prisma.$transaction(async (transaction) => {
    await transaction.groupMember.delete({ where: { id: existing.id } });
    await recordGroupChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.groupMemberRemoved,
      entityId: groupId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: group.organizationalUnitId,
      metadata: { userId, membership: 'removed' },
    });
    const updated = await transaction.user.update({
      where: { id: userId },
      data: { authzVersion: { increment: 1 } },
      select: { authzVersion: true },
    });
    await enqueueGroupRoomRevoke(outbox, transaction, {
      subjectId: userId,
      groupId,
      revision: updated.authzVersion,
    });
    return { authzVersion: updated.authzVersion };
  });
  invalidateActorGroupsCache();
  await invalidatePrincipal(userId, authzVersion);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
