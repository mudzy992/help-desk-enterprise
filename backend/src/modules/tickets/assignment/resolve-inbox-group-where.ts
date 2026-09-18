import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../../authorization/authorization.types';

export type InboxGroupWhere = { not: null } | { in: string[] };

export async function resolveInboxGroupWhere(
  prisma: PrismaService,
  context: AuthorizationContext,
): Promise<InboxGroupWhere | null> {
  if (context.isSuperAdmin) {
    return { not: null };
  }
  const memberships = await prisma.groupMember.findMany({
    where: { userId: context.subjectId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((membership) => membership.groupId);
  if (groupIds.length === 0) {
    return null;
  }
  return { in: groupIds };
}
