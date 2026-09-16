import type { PrismaService } from '../../common/prisma/prisma.service';
import { mapUserRoleResponse } from './map-user-role-response';
import type { UserRoleResponse } from './users.types';
import { UsersError } from './users.error';

const userRoleInclude = {
  role: { select: { key: true, name: true } },
  organizationalUnit: { select: { id: true, ouPath: true } },
  service: { select: { id: true, name: true } },
} as const;

export async function listUserRoles(
  prisma: PrismaService,
  userId: string,
): Promise<readonly UserRoleResponse[]> {
  const normalized = userId.trim();
  const user = await prisma.user.findUnique({
    where: { id: normalized },
    select: { id: true },
  });
  if (user === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  const rows = await prisma.userRole.findMany({
    where: { userId: normalized },
    include: userRoleInclude,
    orderBy: [{ role: { key: 'asc' } }, { id: 'asc' }],
  });
  return rows.map(mapUserRoleResponse);
}
