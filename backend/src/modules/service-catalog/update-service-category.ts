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
import { withServiceCategoryParentMutationLock } from './with-service-category-parent-mutation-lock';

export async function updateServiceCategory(
  prisma: PrismaService,
  serviceCategoryId: string,
  input: UpdateServiceCategoryInput,
  context: CatalogMutationContext,
): Promise<ServiceCategoryResponse> {
  const updated = await prisma.$transaction(
    (transaction) =>
      withServiceCategoryParentMutationLock(transaction, async () => {
        const transactionPrisma = transaction as PrismaService;
        // This read must follow the graph lock. A prior reparent operation may
        // have committed while this writer was waiting for the transaction lock.
        const current = await loadServiceCategory(
          transactionPrisma,
          serviceCategoryId,
        );
        const name =
          input.name === undefined
            ? current.name
            : normalizeServiceName(input.name);
        const parentId =
          input.parentId === undefined ? current.parentId : input.parentId;
        const sortOrder = input.sortOrder ?? current.sortOrder;

        await assertCategoryParentIsValid(transactionPrisma, {
          categoryId: serviceCategoryId,
          parentId,
        });
        const category = await transaction.serviceCategory.update({
          where: { id: serviceCategoryId },
          data: { name, parentId, sortOrder },
        });
        await recordServiceCatalogChange(transactionPrisma, {
          entityType: serviceCategoryChangeLogEntityType(),
          entityId: category.id,
          reason: 'update',
          diff: {
            before: {
              name: current.name,
              parentId: current.parentId,
              sortOrder: current.sortOrder,
            },
            after: { name, parentId, sortOrder },
          },
          actorUserId: context.actorUserId,
        });
        return category;
      }),
    { isolationLevel: 'ReadCommitted' },
  );
  return toServiceCategoryResponse(updated);
}
