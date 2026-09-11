import { authenticationConstants } from '../authentication/authentication.constants';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { InstallSuperAdminPersistence } from './install-super-admin.types';

const superAdminSelect = {
  id: true,
  email: true,
  displayName: true,
  isLocalOnly: true,
  entraObjectId: true,
} as const;

export async function findInstallSuperAdmin(
  prisma: Pick<PrismaService, 'user'>,
): Promise<InstallSuperAdminPersistence | null> {
  return prisma.user.findFirst({
    where: {
      userRoles: {
        some: {
          role: {
            key: authenticationConstants.superAdminRoleKey,
          },
        },
      },
    },
    select: superAdminSelect,
  });
}
