import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import { applySuperAdminLocalOnlyInvariant } from '../authentication/apply-super-admin-local-only-invariant';
import { assertSuperAdminIsLocalOnly } from '../authentication/assert-super-admin-is-local-only';
import { authenticationConstants } from '../authentication/authentication.constants';
import { hashLocalPassword } from '../authentication/hash-local-password';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ensureInstallSuperAdminRole } from './ensure-install-super-admin-role';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { InstallSuperAdminError } from './install-super-admin.error';
import type {
  CreateInstallSuperAdminInput,
  HashInstallSuperAdminPassword,
  InstallSuperAdminPublicRecord,
} from './install-super-admin.types';
import { mapInstallSuperAdminPublicRecord } from './map-install-super-admin-public-record';
import { validateInstallSuperAdminCredentials } from './validate-install-super-admin-credentials';

export async function createInstallSuperAdmin(
  prisma: PrismaService,
  input: CreateInstallSuperAdminInput,
  hashPassword: HashInstallSuperAdminPassword = hashLocalPassword,
): Promise<InstallSuperAdminPublicRecord> {
  const credentials = validateInstallSuperAdminCredentials(input);
  if ((await findInstallSuperAdmin(prisma)) !== null) {
    throw new InstallSuperAdminError('SUPER_ADMIN_ALREADY_EXISTS');
  }
  const emailOwner = await prisma.user.findUnique({
    where: { email: credentials.email },
    select: { id: true },
  });
  if (emailOwner !== null) {
    throw new InstallSuperAdminError('SUPER_ADMIN_EMAIL_TAKEN');
  }
  const localPasswordHash = await hashPassword(credentials.password);
  if (
    localPasswordHash === credentials.password ||
    localPasswordHash.includes(credentials.password)
  ) {
    throw new InstallSuperAdminError('INVALID_SUPER_ADMIN_CREDENTIALS');
  }
  return invalidateConfigurationCachesAfter(prisma.$transaction(async (transaction) => {
    if ((await findInstallSuperAdmin(transaction)) !== null) {
      throw new InstallSuperAdminError('SUPER_ADMIN_ALREADY_EXISTS');
    }
    const localOnly = applySuperAdminLocalOnlyInvariant();
    const created = await transaction.user.create({
      data: {
        email: credentials.email,
        displayName: credentials.displayName,
        isActive: true,
        isLocalOnly: localOnly.isLocalOnly,
        entraObjectId: localOnly.entraObjectId,
        localPasswordHash,
        // Paket 2.1: the super admin password expiry counts from installation.
        passwordChangedAt: new Date(),
        userRoles: {
          create: {
            roleId: await ensureInstallSuperAdminRole(transaction),
          },
        },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        isLocalOnly: true,
        entraObjectId: true,
      },
    });
    assertSuperAdminIsLocalOnly({
      isLocalOnly: created.isLocalOnly,
      entraObjectId: created.entraObjectId,
      roleKeys: [authenticationConstants.superAdminRoleKey],
    });
    const publicRecord = mapInstallSuperAdminPublicRecord(created);
    if (publicRecord === null) {
      throw new InstallSuperAdminError('INVALID_SUPER_ADMIN_CREDENTIALS');
    }
    return publicRecord;
  }));
}
