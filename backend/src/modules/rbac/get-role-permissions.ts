import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadRoleByKey } from './load-role-by-key';

export async function getRolePermissions(
  prisma: PrismaService,
  roleKey: string,
): Promise<readonly string[]> {
  const role = await loadRoleByKey(prisma, roleKey);
  const rows = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    select: { permission: { select: { key: true } } },
    orderBy: { permission: { key: 'asc' } },
  });
  return rows.map((row) => row.permission.key);
}
