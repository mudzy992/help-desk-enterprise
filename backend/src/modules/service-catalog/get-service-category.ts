import { PrismaService } from '../../common/prisma/prisma.service';
import { loadServiceCategory } from './load-service-category';
import type { ServiceCategoryResponse } from './service-catalog.types';
import { toServiceCategoryResponse } from './to-service-category-response';

export async function getServiceCategory(
  prisma: PrismaService,
  serviceCategoryId: string,
): Promise<ServiceCategoryResponse> {
  const record = await loadServiceCategory(prisma, serviceCategoryId);
  return toServiceCategoryResponse(record);
}
