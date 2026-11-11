import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCategoryParentIsValid } from './assert-category-parent-is-valid';
import { loadServiceCategory } from './load-service-category';
import { normalizeServiceName } from './normalize-service-name';
import {
  recordServiceCatalogChange,
  serviceCategoryChangeLogEntityType,
} from './record-service-catalog-change';
import type {
  CatalogMutationContext,
  ServiceCategoryResponse,
  UpdateServiceCategoryInput,
} from './service-catalog.types';
import { toServiceCategoryResponse } from './to-service-category-response';

export async function updateServiceCategory(
  prisma: PrismaService,
  serviceCategoryId: string,
  input: UpdateServiceCategoryInput,
  context: CatalogMutationContext,
): Promise<ServiceCategoryResponse> {
  const current = await loadServiceCategory(prisma, serviceCategoryId);
  const name =
    input.name === undefined ? current.name : normalizeServiceName(input.name);
  const parentId =
    input.parentId === undefined ? current.parentId : input.parentId;
  const sortOrder = input.sortOrder ?? current.sortOrder;
  await assertCategoryParentIsValid(prisma, {
    categoryId: serviceCategoryId,
    parentId,
  });
  const updated = await prisma.$transaction(async (transaction) => {
    const category = await transaction.serviceCategory.update({
      where: { id: serviceCategoryId },
      data: { name, parentId, sortOrder },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceCategoryChangeLogEntityType(),
      entityId: category.id,
      reason: 'update',
      diff: {
        before: { name: current.name, parentId: current.parentId, sortOrder: current.sortOrder },
        after: { name, parentId, sortOrder },
      },
      actorUserId: context.actorUserId,
    });
    return category;
  });
  return toServiceCategoryResponse(updated);
}
