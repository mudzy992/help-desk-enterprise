import type { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { defaultManualDirectoryCatalog } from './default-manual-directory-catalog';

export async function seedManualDirectoryCatalog(
  prisma: PrismaService,
): Promise<{ readonly seeded: boolean }> {
  await ensureManualDirectorySyncSettings(prisma);
  const existing = await prisma.manualDirectoryOrganizationalUnit.count();
  if (existing > 0) {
    return { seeded: false };
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.manualDirectoryOrganizationalUnit.createMany({
      data: defaultManualDirectoryCatalog.organizationalUnits.map((unit) => ({
        externalId: unit.externalId,
        displayName: unit.displayName,
        distinguishedName: unit.distinguishedName ?? '',
        organizationalUnitPath: unit.organizationalUnitPath ?? '',
        parentExternalId: unit.parentExternalId,
        updatedAt: now,
      })),
    }),
    prisma.manualDirectoryUser.createMany({
      data: defaultManualDirectoryCatalog.users.map((user) => ({
        externalId: user.externalId,
        login: user.login,
        email: user.email,
        displayName: user.displayName,
        distinguishedName: user.distinguishedName,
        organizationalUnitPath: user.organizationalUnitPath,
        updatedAt: now,
      })),
    }),
    prisma.manualDirectoryGroup.createMany({
      data: defaultManualDirectoryCatalog.groups.map((group) => ({
        externalId: group.externalId,
        displayName: group.displayName,
        distinguishedName: group.distinguishedName,
        organizationalUnitPath: group.organizationalUnitPath,
        updatedAt: now,
      })),
    }),
  ]);
  return { seeded: true };
}

async function ensureManualDirectorySyncSettings(
  prisma: PrismaService,
): Promise<void> {
  const defaults: readonly {
    readonly key: string;
    readonly value: unknown;
    readonly description: string;
  }[] = [
    {
      key: settingKeys.privateAuthAdReadEnabled,
      value: true,
      description: 'Enables directory read for manual-only catalog sync',
    },
    {
      key: settingKeys.privateAuthAdReadUsersBaseDn,
      value: 'OU=Users,DC=example,DC=com',
      description: 'Users base DN for manual-only catalog',
    },
    {
      key: settingKeys.privateAuthAdReadGroupsBaseDn,
      value: 'OU=Groups,DC=example,DC=com',
      description: 'Groups base DN for manual-only catalog',
    },
  ];
  for (const setting of defaults) {
    const existing = await prisma.appSetting.findUnique({
      where: { key: setting.key },
      select: { id: true },
    });
    if (existing !== null) {
      continue;
    }
    await prisma.appSetting.create({
      data: {
        key: setting.key,
        value: setting.value as never,
        scope: 'PRIVATE',
        isSecret: false,
        description: setting.description,
      },
    });
  }
}
