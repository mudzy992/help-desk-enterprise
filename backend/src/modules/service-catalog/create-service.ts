import { PrismaService } from '../../common/prisma/prisma.service';
import { assertPolicyPackExists } from './assert-policy-pack-exists';
import { assertServiceCategoryExists } from './assert-service-category-exists';
import {
  isAllowedServiceLifecycleState,
} from './assert-service-lifecycle-transition';
import { assertServiceSlugIsAvailable } from './assert-slug-is-available';
import { normalizeServiceName } from './normalize-service-name';
import { normalizeServiceSlug } from './normalize-service-slug';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogError } from './service-catalog.error';
import type {
  CatalogMutationContext,
  CreateServiceInput,
  ServiceLifecycleConfiguration,
  ServiceResponse,
} from './service-catalog.types';
import { throwIfSlugConstraintViolated } from './throw-if-slug-constraint-violated';
import { toServiceResponse } from './to-service-response';

export async function createService(
  prisma: PrismaService,
  input: CreateServiceInput,
  configuration: ServiceLifecycleConfiguration,
  context: CatalogMutationContext,
): Promise<ServiceResponse> {
  const name = normalizeServiceName(input.name);
  const slug = normalizeServiceSlug(input.slug);
  if (
    !isAllowedServiceLifecycleState(
      configuration.defaultStateOnCreate,
      configuration.allowedStates,
    )
  ) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_STATE');
  }
  await assertServiceCategoryExists(prisma, input.categoryId);
  await assertPolicyPackExists(prisma, input.policyPackId);
  await assertServiceSlugIsAvailable(prisma, slug);
  try {
    const created = await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.create({
        data: {
          name,
          slug,
          categoryId: input.categoryId,
          lifecycle: configuration.defaultStateOnCreate,
          classification: input.classification ?? 'INTERNAL',
          requiresApproval: input.requiresApproval ?? false,
          isConfidentialDefault: input.isConfidentialDefault ?? false,
          autoAssignStrategy: input.autoAssignStrategy ?? 'NONE',
          policyPackId: input.policyPackId ?? null,
        },
      });
      await recordServiceCatalogChange(transaction as PrismaService, {
        entityType: serviceChangeLogEntityType(),
        entityId: service.id,
        reason: 'create',
        diff: {
          after: {
            name,
            slug,
            categoryId: input.categoryId,
            lifecycle: service.lifecycle,
          },
        },
        actorUserId: context.actorUserId,
      });
      return service;
    });
    return toServiceResponse(created);
  } catch (error) {
    throwIfSlugConstraintViolated(error);
    throw error;
  }
}
