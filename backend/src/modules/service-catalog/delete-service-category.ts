import { PrismaService } from '../../common/prisma/prisma.service';
import { loadServiceCategory } from './load-service-category';
import {
  recordServiceCatalogChange,
  serviceCategoryChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext } from './service-catalog.types';

export async function deleteServiceCategory(
  prisma: PrismaService,
  serviceCategoryId: string,
  context: CatalogMutationContext,
): Promise<void> {
  const current = await loadServiceCategory(prisma, serviceCategoryId);
  const [childCount, serviceCount] = await Promise.all([
    prisma.serviceCategory.count({ where: { parentId: serviceCategoryId } }),
    prisma.service.count({ where: { categoryId: serviceCategoryId } }),
  ]);
  if (childCount > 0) {
    throw new ServiceCatalogError('CATEGORY_HAS_CHILDREN');
  }
  if (serviceCount > 0) {
    throw new ServiceCatalogError('CATEGORY_HAS_SERVICES');
  }
  await prisma.$transaction(async (transaction) => {
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceCategoryChangeLogEntityType(),
      entityId: current.id,
      reason: 'delete',
      diff: { before: { name: current.name, slug: current.slug } },
      actorUserId: context.actorUserId,
    });
    await transaction.serviceCategory.delete({
      where: { id: serviceCategoryId },
    });
  });
}
