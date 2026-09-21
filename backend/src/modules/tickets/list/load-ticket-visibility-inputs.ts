import { PrismaService } from '../../../common/prisma/prisma.service';
import type { OrganizationalUnitScopeRow } from './build-manage-scope-where';

/**
 * Everything the visibility predicate needs, in two queries for the whole
 * list (the per-ticket check used to look these up again for every ticket).
 */
export async function loadTicketVisibilityInputs(
  prisma: PrismaService,
  actorUserId: string,
): Promise<{
  readonly units: readonly OrganizationalUnitScopeRow[];
  readonly actorGroupIds: readonly string[];
}> {
  const [units, memberships] = await Promise.all([
    prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } }),
    prisma.groupMember.findMany({
      where: { userId: actorUserId },
      select: { groupId: true },
    }),
  ]);
  return {
    units,
    actorGroupIds: memberships.map((membership) => membership.groupId),
  };
}
