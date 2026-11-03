import type { OptimisticConcurrencyService } from '../../common/optimistic-concurrency/optimistic-concurrency.service';
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
  ifMatch: string | string[] | undefined,
  context: CatalogMutationContext,
  optimisticConcurrency: OptimisticConcurrencyService,
): Promise<ServiceCategoryResponse> {
  const result = await optimisticConcurrency.execute({
    ifMatch,
    mutate: (expectedRevision) =>
      prisma.$transaction(
        (transaction) =>
          withServiceCategoryParentMutationLock(transaction, async () => {
            const transactionPrisma = transaction as PrismaService;
            // Read only after the hierarchy lock; the revision then anchors the
            // parent validation, conditional write and before/after audit pair.
            const current = await transaction.serviceCategory.findUnique({
              where: { id: serviceCategoryId },
            });
            if (current === null || current.revision !== expectedRevision) {
              return null;
            }
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
            const write = await transaction.serviceCategory.updateMany({
              where: { id: serviceCategoryId, revision: expectedRevision },
              data: {
                name,
                parentId,
                sortOrder,
                revision: { increment: 1 },
              },
            });
            if (write.count !== 1) {
              return null;
            }
            const updated = await loadServiceCategory(
              transactionPrisma,
              serviceCategoryId,
            );
            await recordServiceCatalogChange(transactionPrisma, {
              entityType: serviceCategoryChangeLogEntityType(),
              entityId: updated.id,
              reason: 'update',
              diff: {
                before: {
                  name: current.name,
                  parentId: current.parentId,
                  sortOrder: current.sortOrder,
                },
                after: { name: updated.name, parentId: updated.parentId, sortOrder: updated.sortOrder },
              },
              actorUserId: context.actorUserId,
            });
            return { value: updated, version: updated.revision };
          }),
        { isolationLevel: 'ReadCommitted' },
      ),
    readCurrentVersion: async () => {
      const current = await prisma.serviceCategory.findUnique({
        where: { id: serviceCategoryId },
        select: { revision: true },
      });
      return current?.revision ?? null;
    },
  });
  return toServiceCategoryResponse(result.value);
}
