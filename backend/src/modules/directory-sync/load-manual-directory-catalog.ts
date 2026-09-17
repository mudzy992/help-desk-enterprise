import type { PrismaService } from '../../common/prisma/prisma.service';
import type {
  DirectoryGroup,
  DirectoryOrganizationalUnit,
  DirectoryUser,
} from './directory-sync.types';

export type ManualDirectoryCatalogSnapshot = {
  readonly users: readonly DirectoryUser[];
  readonly groups: readonly DirectoryGroup[];
  readonly organizationalUnits: readonly DirectoryOrganizationalUnit[];
};

export async function loadManualDirectoryCatalog(
  prisma: PrismaService,
): Promise<ManualDirectoryCatalogSnapshot> {
  const [organizationalUnits, users, groups] = await Promise.all([
    prisma.manualDirectoryOrganizationalUnit.findMany({
      orderBy: { organizationalUnitPath: 'asc' },
    }),
    prisma.manualDirectoryUser.findMany({
      orderBy: { externalId: 'asc' },
    }),
    prisma.manualDirectoryGroup.findMany({
      orderBy: { externalId: 'asc' },
    }),
  ]);
  return {
    organizationalUnits: organizationalUnits.map((unit) => ({
      externalId: unit.externalId,
      displayName: unit.displayName,
      distinguishedName: unit.distinguishedName,
      organizationalUnitPath: unit.organizationalUnitPath,
      type: unit.type,
    })),
    users: users.map((user) => ({
      externalId: user.externalId,
      login: user.login,
      email: user.email,
      displayName: user.displayName,
      distinguishedName: user.distinguishedName,
      organizationalUnitPath: user.organizationalUnitPath,
    })),
    groups: groups.map((group) => ({
      externalId: group.externalId,
      displayName: group.displayName,
      distinguishedName: group.distinguishedName,
      organizationalUnitPath: group.organizationalUnitPath,
    })),
  };
}
