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
    await materializeOrganizationalUnits(prisma, result, invalidateUsers);
    return;
  }
  if (result.operation === 'users') {
    await materializeUsers(prisma, result, invalidateUsers);
    return;
  }
  if (result.operation === 'groups') {
    await materializeGroups(prisma, result);
  }
}

async function materializeOrganizationalUnits(
  prisma: PrismaService,
  result: DirectoryReadResult,
  invalidateUsers: DirectoryUserInvalidationHook,
): Promise<void> {
  const sorted = [...result.organizationalUnits].sort(
    (left, right) =>
      (left.organizationalUnitPath?.split('/').length ?? 0) -
      (right.organizationalUnitPath?.split('/').length ?? 0),
  );
  const materializable = sorted.filter(
    (unit) => unit.distinguishedName && unit.organizationalUnitPath,
  );
  const changedUnitIds = new Set<string>();
  for (const unit of materializable) {
    const existing = await prisma.organizationalUnit.findUnique({
      where: { distinguishedName: unit.distinguishedName! },
      select: { id: true, ouPath: true },
    });
    if (
      existing !== null &&
      existing.ouPath !== unit.organizationalUnitPath
    ) {
      changedUnitIds.add(existing.id);
    }
  }

  // Read affected holders before any OU write. If this lookup fails, nothing in
  // this operation has changed yet; if a later upsert fails partway through, the
  // known holders are still invalidated below for every path already rewritten.
  const changedUserIds =
    changedUnitIds.size === 0
      ? []
      : [
          ...new Set(
            (
              await prisma.userRole.findMany({
                where: { organizationalUnitId: { in: [...changedUnitIds] } },
                select: { userId: true },
                distinct: ['userId'],
              })
            ).map((holder) => holder.userId),
          ),
        ].sort();

  let writeFailed = false;
  let writeFailure: unknown;
  try {
    for (const unit of materializable) {
      const parentPath = parentOrganizationalUnitPath(
        unit.organizationalUnitPath!,
      );
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
        where: { distinguishedName: unit.distinguishedName! },
        create: {
          name: unit.displayName,
          type,
          distinguishedName: unit.distinguishedName!,
          ouPath: unit.organizationalUnitPath!,
          parentId: parent?.id ?? null,
        },
        update: {
          name: unit.displayName,
          type,
          ouPath: unit.organizationalUnitPath!,
          parentId: parent?.id ?? null,
        },
      });
      invalidateOrganizationalUnitScopeCache();
    }
  } catch (error) {
    writeFailed = true;
    writeFailure = error;
  }

  let invalidationFailed = false;
  let invalidationFailure: unknown;
  if (changedUserIds.length > 0) {
    try {
      await invalidateUsers(changedUserIds);
    } catch (error) {
      invalidationFailed = true;
      invalidationFailure = error;
    }
  }
  if (writeFailed) throw writeFailure;
  if (invalidationFailed) throw invalidationFailure;
}

async function materializeUsers(
  prisma: PrismaService,
  result: DirectoryReadResult,
  invalidateUsers: DirectoryUserInvalidationHook,
): Promise<void> {
  const updatedUserIds = new Set<string>();
  let writeFailed = false;
  let writeFailure: unknown;
  try {
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
      // Record the known identity before writing: a driver can report a
      // transport error after PostgreSQL committed the upsert.
      if (existing !== null) updatedUserIds.add(existing.id);
      await prisma.user.upsert({
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
    }
  } catch (error) {
    writeFailed = true;
    writeFailure = error;
  }

  let invalidationFailed = false;
  let invalidationFailure: unknown;
  const userIds = [...updatedUserIds].sort();
  if (userIds.length > 0) {
    try {
      await invalidateUsers(userIds);
    } catch (error) {
      invalidationFailed = true;
      invalidationFailure = error;
    }
  }
  if (writeFailed) throw writeFailure;
  if (invalidationFailed) throw invalidationFailure;
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
