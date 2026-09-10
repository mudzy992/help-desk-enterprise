import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceCategoryRecord } from './service-catalog.types';

export async function loadServiceCategory(
  prisma: PrismaService,
  serviceCategoryId: string,
): Promise<ServiceCategoryRecord> {
  const record = await prisma.serviceCategory.findUnique({
    where: { id: serviceCategoryId },
  });
  if (record === null) {
    throw new ServiceCatalogError('CATEGORY_NOT_FOUND');
  }
  return record;
}
