import { authenticationConstants } from '../authentication/authentication.constants';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { installSuperAdminConstants } from './install-super-admin.constants';

export async function ensureInstallSuperAdminRole(
  prisma: Pick<PrismaService, 'role'>,
): Promise<string> {
  const existing = await prisma.role.findUnique({
    where: { key: authenticationConstants.superAdminRoleKey },
    select: { id: true },
  });
  if (existing !== null) {
    return existing.id;
  }
  const created = await prisma.role.create({
    data: {
      key: authenticationConstants.superAdminRoleKey,
      name: installSuperAdminConstants.roleName,
      isSystem: true,
    },
    select: { id: true },
  });
  return created.id;
}
