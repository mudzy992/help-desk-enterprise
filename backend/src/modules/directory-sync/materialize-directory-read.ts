import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { DirectoryReadResult } from './directory-sync.types';

/**
 * Phase 2.2: a directory read rewrites display names and unit membership for
 * already-known users, i.e. fields that live in the cached principal context.
 * The ids of the rows that actually changed are handed to the caller, which
 * drops their cache entries once the whole read has been materialized.
 */
export type DirectoryUserInvalidationHook = (
  userIds: readonly string[],
) => Promise<unknown>;

export async function materializeDirectoryRead(
  prisma: PrismaService,
  result: DirectoryReadResult,
  invalidateUsers: DirectoryUserInvalidationHook = async () => {},
): Promise<void> {
  if (result.operation === 'organizational_units') {
    await materializeOrganizationalUnits(prisma, result);
    return;
  }
  if (result.operation === 'users') {
    const affectedUserIds = await materializeUsers(prisma, result);
    if (affectedUserIds.length > 0) {
      await invalidateUsers(affectedUserIds);
    }
    return;
  }
  if (result.operation === 'groups') {
    await materializeGroups(prisma, result);
  }
}

async function materializeOrganizationalUnits(
  prisma: PrismaService,
  result: DirectoryReadResult,
): Promise<void> {
  const sorted = [...result.organizationalUnits].sort(
    (left, right) =>
      (left.organizationalUnitPath?.split('/').length ?? 0) -
      (right.organizationalUnitPath?.split('/').length ?? 0),
  );
  for (const unit of sorted) {
    if (!unit.distinguishedName || !unit.organizationalUnitPath) {
      continue;
    }
    const parentPath = parentOrganizationalUnitPath(unit.organizationalUnitPath);
    const parent =
      parentPath === null
        ? null
        : await prisma.organizationalUnit.findUnique({
            where: { ouPath: parentPath },
            select: { id: true },
          });
    const type =
      unit.type === 'DIRECTORATE' ||
      unit.type === 'BRANCH' ||
      unit.type === 'OFFICE' ||
      unit.type === 'SECTOR' ||
      unit.type === 'SERVICE'
        ? unit.type
        : parent === null
          ? 'DIRECTORATE'
          : 'BRANCH';
    await prisma.organizationalUnit.upsert({
      where: { distinguishedName: unit.distinguishedName },
      create: {
        name: unit.displayName,
        type,
        distinguishedName: unit.distinguishedName,
        ouPath: unit.organizationalUnitPath,
        parentId: parent?.id ?? null,
      },
      update: {
        name: unit.displayName,
        type,
        ouPath: unit.organizationalUnitPath,
        parentId: parent?.id ?? null,
      },
    });
    invalidateOrganizationalUnitScopeCache();
  }
}

async function materializeUsers(
  prisma: PrismaService,
  result: DirectoryReadResult,
): Promise<readonly string[]> {
  const updatedUserIds = new Set<string>();
  for (const user of result.users) {
    if (!user.email) {
      continue;
    }
    const organizationalUnit =
      user.organizationalUnitPath === null
        ? null
        : await prisma.organizationalUnit.findUnique({
            where: { ouPath: user.organizationalUnitPath },
            select: { id: true },
          });
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true, isLocalOnly: true },
    });
    if (existing?.isLocalOnly === true) {
      continue;
    }
    const materialized = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        displayName: user.displayName,
        distinguishedName: user.distinguishedName,
        organizationalUnitId: organizationalUnit?.id ?? null,
        isLocalOnly: false,
        isActive: true,
      },
      update: {
        displayName: user.displayName,
        distinguishedName: user.distinguishedName,
        organizationalUnitId: organizationalUnit?.id ?? null,
      },
      select: { id: true },
    });
    if (existing !== null) {
      // Only the update branch can leave a stale cache behind: a freshly
      // created user has never been loaded.
      updatedUserIds.add(materialized.id);
    }
  }
  return [...updatedUserIds];
}

async function materializeGroups(
  prisma: PrismaService,
  result: DirectoryReadResult,
): Promise<void> {
  for (const group of result.groups) {
    if (!group.organizationalUnitPath) {
      continue;
    }
    const organizationalUnit = await prisma.organizationalUnit.findUnique({
      where: { ouPath: group.organizationalUnitPath },
      select: { id: true },
    });
    if (organizationalUnit === null) {
      continue;
    }
    const key = `manual_${group.externalId.replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const existing = await prisma.group.findUnique({ where: { key } });
    if (existing === null) {
      await prisma.group.create({
        data: {
          name: group.displayName,
          key,
          organizationalUnitId: organizationalUnit.id,
          isFallback: false,
        },
      });
      continue;
    }
    await prisma.group.update({
      where: { key },
      data: {
        name: group.displayName,
        organizationalUnitId: organizationalUnit.id,
      },
    });
  }
}

function parentOrganizationalUnitPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }
  return `/${segments.slice(0, -1).join('/')}`;
}
