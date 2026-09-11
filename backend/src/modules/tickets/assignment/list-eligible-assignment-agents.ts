import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { canManageTicketsInScope } from '../authorize-ticket-actor';

export async function listEligibleAssignmentAgents(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  input: {
    readonly groupId: string;
    readonly originUnitId: string;
    readonly originUnitPath: string;
    readonly serviceId: string;
  },
): Promise<readonly string[]> {
  const members = await prisma.groupMember.findMany({
    where: { groupId: input.groupId },
    select: { userId: true },
  });
  const eligibleUserIds: string[] = [];
  for (const member of members) {
    const context = await authorizationContextLoader.loadBySubjectId(
      member.userId,
    );
    if (context === null) {
      continue;
    }
    if (
      !canManageTicketsInScope({
        context,
        originUnitId: input.originUnitId,
        originUnitPath: input.originUnitPath,
        serviceId: input.serviceId,
      })
    ) {
      continue;
    }
    eligibleUserIds.push(member.userId);
  }
  return [...eligibleUserIds].sort();
}
