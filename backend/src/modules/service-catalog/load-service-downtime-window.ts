import { PrismaService } from '../../common/prisma/prisma.service';
import type { DowntimeWindowRecord } from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';

export async function loadServiceDowntimeWindow(
  prisma: PrismaService,
  serviceId: string,
  downtimeWindowId: string,
): Promise<DowntimeWindowRecord> {
  const record = await prisma.serviceDowntimeWindow.findUnique({
    where: { id: downtimeWindowId },
  });
  if (record === null || record.serviceId !== serviceId) {
    throw new ServiceCatalogError('DOWNTIME_NOT_FOUND');
  }
  return record;
}
