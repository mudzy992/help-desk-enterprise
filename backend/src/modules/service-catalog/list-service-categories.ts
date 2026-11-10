import { PrismaService } from '../../common/prisma/prisma.service';
import type { ServiceCategoryResponse } from './service-catalog.types';
import { toServiceCategoryResponse } from './to-service-category-response';

export async function listServiceCategories(
  prisma: PrismaService,
): Promise<readonly ServiceCategoryResponse[]> {
  const records = await prisma.serviceCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return records.map(toServiceCategoryResponse);
}
