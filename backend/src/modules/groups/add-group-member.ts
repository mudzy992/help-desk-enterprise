import { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from './groups.error';
import type { PrincipalInvalidationHook } from './groups.types';
import type { GroupResponse } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { toGroupResponse } from './to-group-response';

export async function addGroupMember(
  prisma: PrismaService,
  groupId: string,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<GroupResponse> {
  await loadGroupRecord(prisma, groupId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
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
  await prisma.groupMember.create({ data: { groupId, userId } });
  // Phase 2.2: group membership is part of the principal context (and of the
  // inbox/visibility decisions derived from it), so the member's cache is stale
  // the moment this row lands.
  await invalidatePrincipal(userId);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
