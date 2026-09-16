import type { PrismaService } from '../../common/prisma/prisma.service';
import type { DirectoryReadResult } from './directory-sync.types';

export async function materializeDirectoryRead(
  prisma: PrismaService,
  result: DirectoryReadResult,
): Promise<void> {
  if (result.operation === 'organizational_units') {
    await materializeOrganizationalUnits(prisma, result);
    return;
  }
  if (result.operation === 'users') {
    await materializeUsers(prisma, result);
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
    await prisma.organizationalUnit.upsert({
      where: { distinguishedName: unit.distinguishedName },
      create: {
        name: unit.displayName,
        type: parent === null ? 'DIRECTORATE' : 'BRANCH',
        distinguishedName: unit.distinguishedName,
        ouPath: unit.organizationalUnitPath,
        parentId: parent?.id ?? null,
      },
      update: {
        name: unit.displayName,
        ouPath: unit.organizationalUnitPath,
        parentId: parent?.id ?? null,
      },
    });
  }
}

async function materializeUsers(
  prisma: PrismaService,
  result: DirectoryReadResult,
): Promise<void> {
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
    });
  }
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
