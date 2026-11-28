import { invalidateSharedSettingsSnapshot } from '../settings/settings-snapshot';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrganizationalUnitType } from '../../generated/prisma/enums';
import { settingKeys } from '../settings/setting-keys';
import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';
import { defaultManualDirectoryCatalog } from './default-manual-directory-catalog';

type TreeUnit = {
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly distinguishedName: string;
  readonly ouPath: string;
  readonly parentId: string | null;
  readonly id: string;
};

/**
 * W2.36c: the seed used to write a catalogue in **its own** namespace
 * (`OU=Users,DC=example,DC=com`) even when the installation already had a real OU
 * tree (`OU=Korisnici,DC=local`). From then on the catalogue and the tree could
 * not meet: a unit added under a catalogue row got a DN no read accepted, and the
 * base DNs pointed at the sample namespace instead of the operator's.
 *
 * The tree is the authority. When it has units, the catalogue **mirrors** it and
 * the base DNs come from it; the sample rows are written only into an empty
 * installation, where they are the only thing there is to read.
 */
export async function seedManualDirectoryCatalog(
  prisma: PrismaService,
): Promise<{ readonly seeded: boolean; readonly adoptedTree: boolean }> {
  const treeUnits = await prisma.organizationalUnit.findMany({
    orderBy: { ouPath: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      distinguishedName: true,
      ouPath: true,
      parentId: true,
    },
  });
  await ensureManualDirectorySyncSettings(prisma, {
    usersBaseDistinguishedName: usersBaseDistinguishedNameFor(treeUnits),
    groupsBaseDistinguishedName: groupsBaseDistinguishedNameFor(treeUnits),
  });
  const existing = await prisma.manualDirectoryOrganizationalUnit.count();
  if (existing > 0) {
    return { seeded: false, adoptedTree: false };
  }
  if (treeUnits.length > 0) {
    await adoptTreeIntoCatalog(prisma, treeUnits);
    return { seeded: true, adoptedTree: true };
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
        type: normalizeUnitType(unit.type, unit.parentExternalId ?? null),
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
  return { seeded: true, adoptedTree: false };
}

async function adoptTreeIntoCatalog(
  prisma: PrismaService,
  treeUnits: readonly TreeUnit[],
): Promise<void> {
  const externalIdByUnitId = new Map<string, string>();
  const entityById = new Map(treeUnits.map((unit) => [unit.id, unit] as const));
  // Shallowest first, so a parent's `externalId` exists before its children need it.
  const ordered = [...treeUnits].sort(
    (left, right) =>
      left.ouPath.split('/').length - right.ouPath.split('/').length ||
      left.ouPath.localeCompare(right.ouPath),
  );
  for (const unit of ordered) {
    const parentExternalId =
      unit.parentId === null
        ? null
        : (externalIdByUnitId.get(unit.parentId) ??
          mirrorExternalIdOf(entityById, unit.parentId));
    const externalId = createManualDirectoryOrganizationalUnitExternalId(unit.ouPath);
    externalIdByUnitId.set(unit.id, externalId);
    await prisma.manualDirectoryOrganizationalUnit.create({
      data: {
        externalId,
        displayName: unit.name,
        distinguishedName: unit.distinguishedName,
        organizationalUnitPath: unit.ouPath,
        parentExternalId,
        type: unit.type,
      },
    });
  }
}

function mirrorExternalIdOf(
  byId: ReadonlyMap<string, TreeUnit>,
  parentId: string,
): string | null {
  const parent = byId.get(parentId);
  return parent === undefined
    ? null
    : createManualDirectoryOrganizationalUnitExternalId(parent.ouPath);
}

function usersBaseDistinguishedNameFor(treeUnits: readonly TreeUnit[]): string {
  const root = treeUnits.find((unit) => unit.parentId === null);
  return root?.distinguishedName ?? 'OU=Users,DC=example,DC=com';
}

function groupsBaseDistinguishedNameFor(treeUnits: readonly TreeUnit[]): string {
  const root = treeUnits.find((unit) => unit.parentId === null);
  if (root === undefined) {
    return 'OU=Groups,DC=example,DC=com';
  }
  // W2.36c: a groups OU exists in the tree only when the operator made one; an
  // empty base means "no group read configured", never a DN in another namespace.
  const groupsUnit = treeUnits.find(
    (unit) => unit.parentId === null && /group|grup/i.test(unit.name),
  );
  return groupsUnit?.distinguishedName ?? '';
}

function normalizeUnitType(
  type: unknown,
  parentExternalId: string | null,
): OrganizationalUnitType {
  return type === 'DIRECTORATE' ||
    type === 'BRANCH' ||
    type === 'OFFICE' ||
    type === 'SECTOR' ||
    type === 'SERVICE'
    ? type
    : parentExternalId === null
      ? 'DIRECTORATE'
      : 'BRANCH';
}

async function ensureManualDirectorySyncSettings(
  prisma: PrismaService,
  bases: {
    readonly usersBaseDistinguishedName: string;
    readonly groupsBaseDistinguishedName: string;
  },
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
      value: bases.usersBaseDistinguishedName,
      description: 'Users base DN for manual-only catalog',
    },
    {
      key: settingKeys.privateAuthAdReadGroupsBaseDn,
      value: bases.groupsBaseDistinguishedName,
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
    invalidateSharedSettingsSnapshot();
  }
}
