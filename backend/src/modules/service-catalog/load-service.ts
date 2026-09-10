import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceRecord } from './service-catalog.types';

export async function loadService(
  prisma: PrismaService,
  serviceId: string,
): Promise<ServiceRecord> {
  const record = await prisma.service.findUnique({
    where: { id: serviceId },
  });
  if (record === null) {
    throw new ServiceCatalogError('NOT_FOUND');
  }
  return record;
}
