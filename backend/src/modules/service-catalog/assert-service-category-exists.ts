import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

export async function assertServiceCategoryExists(
  prisma: PrismaService,
  categoryId: string,
): Promise<void> {
  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (category === null) {
    throw new ServiceCatalogError('CATEGORY_NOT_FOUND');
  }
}
