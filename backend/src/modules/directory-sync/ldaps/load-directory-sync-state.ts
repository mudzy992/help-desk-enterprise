import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { ExistingDirectoryUnit, ExistingDirectoryUser } from './build-directory-sync-plan';
import { isDistinguishedNameWithin } from './distinguished-name';

/**
 * Paket 1.8: the application side of the diff. Local accounts are loaded only
 * as far as needed to detect e-mail collisions (id, e-mail, flag).
 */
export async function loadDirectorySyncState(
  prisma: PrismaService,
  usersBaseDn: string,
): Promise<{ units: ExistingDirectoryUnit[]; users: ExistingDirectoryUser[] }> {
  const unitRows = await prisma.organizationalUnit.findMany({
    select: {
      id: true, name: true, type: true, distinguishedName: true, ouPath: true,
      company: true, department: true, parent: { select: { ouPath: true } },
    },
  });
  const units: ExistingDirectoryUnit[] = unitRows.map((unit) => ({
    id: unit.id,
    name: unit.name,
    type: unit.type,
    distinguishedName: unit.distinguishedName,
    path: unit.ouPath,
    parentPath: unit.parent?.ouPath ?? null,
    company: unit.company,
    department: unit.department,
  }));
  const userRows = await prisma.user.findMany({
    select: {
      id: true, email: true, displayName: true, isActive: true, isLocalOnly: true,
      directoryObjectGuid: true, directoryDeactivatedAt: true, distinguishedName: true,
      company: true, department: true,
      organizationalUnit: { select: { ouPath: true } },
      userRoles: {
        where: { serviceId: null, role: { key: { in: ['ADMIN', 'AGENT'] } } },
        select: { id: true, role: { select: { key: true } }, organizationalUnit: { select: { ouPath: true } } },
      },
    },
  });
  const users: ExistingDirectoryUser[] = userRows.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    isLocalOnly: user.isLocalOnly,
    directoryObjectGuid: user.directoryObjectGuid,
    directoryDeactivatedAt: user.directoryDeactivatedAt?.toISOString() ?? null,
    distinguishedName: user.distinguishedName,
    company: user.company,
    department: user.department,
    ouPath: user.organizationalUnit?.ouPath ?? null,
    managed:
      !user.isLocalOnly &&
      (user.directoryObjectGuid !== null ||
        (user.distinguishedName !== null && isDistinguishedNameWithin(user.distinguishedName, usersBaseDn))),
    directoryRoles: user.userRoles.map((role) => ({
      userRoleId: role.id,
      roleKey: role.role.key,
      ouPath: role.organizationalUnit?.ouPath ?? null,
    })),
  }));
  return { units, users };
}
