import {
  canUseScopeCatalogCache,
  loadCachedOrganizationalUnitPath,
} from '../../common/cache/scope-catalog-cache';
import { PrismaService } from '../../common/prisma/prisma.service';

export async function loadOrganizationalUnitPath(
  prisma: PrismaService,
  organizationalUnitId: string | null,
): Promise<string | null> {
  if (organizationalUnitId === null || organizationalUnitId.trim().length === 0) {
    return null;
  }
  if (canUseScopeCatalogCache(prisma)) {
    return loadCachedOrganizationalUnitPath(prisma, organizationalUnitId.trim());
  }
  const record = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId.trim() },
    select: { ouPath: true },
  });
  if (record === null || record.ouPath.trim().length === 0) {
    return null;
  }
  return record.ouPath;
}

export async function serviceExists(
  prisma: PrismaService,
  serviceId: string | null,
): Promise<boolean> {
  if (serviceId === null || serviceId.trim().length === 0) {
    return false;
  }
  const record = await prisma.service.findUnique({
    where: { id: serviceId.trim() },
    select: { id: true },
  });
  return record !== null;
}
