import type { PrismaService } from '../../common/prisma/prisma.service';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

export async function deleteManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  externalId: string,
): Promise<void> {
  const existing = await prisma.manualDirectoryOrganizationalUnit.findUnique({
    where: { externalId },
  });
  if (existing === null) {
    throw new ManualDirectoryCatalogError('NOT_FOUND');
  }
  const childCount = await prisma.manualDirectoryOrganizationalUnit.count({
    where: { parentExternalId: externalId },
  });
  if (childCount > 0) {
    throw new ManualDirectoryCatalogError('HAS_CHILDREN');
  }
  const catalogUsers = await prisma.manualDirectoryUser.count({
    where: { organizationalUnitPath: existing.organizationalUnitPath },
  });
  if (catalogUsers > 0) {
    throw new ManualDirectoryCatalogError('HAS_MAPPED_USERS');
  }
  const materialized = await prisma.organizationalUnit.findUnique({
    where: { distinguishedName: existing.distinguishedName },
    include: { _count: { select: { children: true, users: true } } },
  });
  if (materialized !== null) {
    if (materialized._count.children > 0) {
      throw new ManualDirectoryCatalogError('HAS_CHILDREN');
    }
    if (materialized._count.users > 0) {
      throw new ManualDirectoryCatalogError('HAS_MAPPED_USERS');
    }
  }
  await prisma.manualDirectoryOrganizationalUnit.delete({
    where: { externalId },
  });
}
