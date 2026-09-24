import { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from './groups.error';
import type { PrincipalInvalidationHook } from './groups.types';
import type { GroupResponse } from './groups.types';
import { loadGroupRecord } from './load-group-record';
import { toGroupResponse } from './to-group-response';

export async function removeGroupMember(
  prisma: PrismaService,
  groupId: string,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<GroupResponse> {
  await loadGroupRecord(prisma, groupId);
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (existing === null) {
    throw new GroupsError('MEMBER_NOT_FOUND');
  }
  await prisma.groupMember.delete({ where: { id: existing.id } });
  await invalidatePrincipal(userId);
  return toGroupResponse(await loadGroupRecord(prisma, groupId));
}
