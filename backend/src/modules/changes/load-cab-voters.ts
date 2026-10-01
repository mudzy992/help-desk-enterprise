import type { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';

/** At most this many CAB members are considered (more = misconfigured group). */
export const cabVotersMax = 100;

/** §8: members of a CAB group who can vote (active, change.approve through a role). */
export async function loadCabVoterIds(prisma: PrismaService, groupId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      anonymizedAt: null,
      groupMembers: { some: { groupId } },
      userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.changeApprove } } } } } },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: cabVotersMax,
  });
  return users.map((user) => user.id);
}
