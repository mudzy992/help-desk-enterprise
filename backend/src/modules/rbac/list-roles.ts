import type { PrismaService } from '../../common/prisma/prisma.service';
import type { RoleSummaryResponse } from './rbac.types';

export async function listRoles(
  prisma: PrismaService,
): Promise<readonly RoleSummaryResponse[]> {
  const roles = await prisma.role.findMany({
    orderBy: { key: 'asc' },
    select: {
      key: true,
      name: true,
      _count: { select: { rolePermissions: true } },
    },
  });
  return roles.map((role) => ({
    key: role.key,
    name: role.name,
    permissionCount: role._count.rolePermissions,
  }));
}
