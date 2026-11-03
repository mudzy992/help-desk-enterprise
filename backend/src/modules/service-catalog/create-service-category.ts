import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCategoryParentIsValid } from './assert-category-parent-is-valid';
import { assertServiceCategorySlugIsAvailable } from './assert-slug-is-available';
import { normalizeServiceName } from './normalize-service-name';
import { normalizeServiceSlug } from './normalize-service-slug';
import {
  recordServiceCatalogChange,
  serviceCategoryChangeLogEntityType,
} from './record-service-catalog-change';
import type {
  CatalogMutationContext,
  CreateServiceCategoryInput,
  ServiceCategoryResponse,
} from './service-catalog.types';
import { throwIfSlugConstraintViolated } from './throw-if-slug-constraint-violated';
import { toServiceCategoryResponse } from './to-service-category-response';
import { withServiceCategoryParentMutationLock } from './with-service-category-parent-mutation-lock';

export async function createServiceCategory(
  prisma: PrismaService,
  input: CreateServiceCategoryInput,
  context: CatalogMutationContext,
): Promise<ServiceCategoryResponse> {
  const name = normalizeServiceName(input.name);
  const slug = normalizeServiceSlug(input.slug);
  const parentId = input.parentId ?? null;
  try {
    const created = await prisma.$transaction(
      async (transaction) => {
        const transactionPrisma = transaction as PrismaService;
        const create = async () => {
          await assertCategoryParentIsValid(transactionPrisma, { parentId });
          await assertServiceCategorySlugIsAvailable(transactionPrisma, slug);
          const category = await transaction.serviceCategory.create({
            data: {
              name,
              slug,
              sortOrder: input.sortOrder ?? 0,
              parentId,
            },
          });
          await recordServiceCatalogChange(transactionPrisma, {
            entityType: serviceCategoryChangeLogEntityType(),
            entityId: category.id,
            reason: 'create',
            diff: { after: { name, slug, parentId } },
            actorUserId: context.actorUserId,
          });
          return category;
        };

        // Root categories do not add an edge to the graph. A category with a
        // parent must validate and insert under the same lock used by reparenting.
        return parentId === null
          ? create()
          : withServiceCategoryParentMutationLock(transaction, create);
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return toServiceCategoryResponse(created);
  } catch (error) {
    throwIfSlugConstraintViolated(error);
    throw error;
  }
}
