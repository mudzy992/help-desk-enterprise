import { PrismaService } from '../../common/prisma/prisma.service';
import { assertPolicyPackExists } from './assert-policy-pack-exists';
import { assertServiceCategoryExists } from './assert-service-category-exists';
import { loadService } from './load-service';
import { normalizeServiceName } from './normalize-service-name';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import type {
  CatalogMutationContext,
  ServiceResponse,
  UpdateServiceInput,
} from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function updateService(
  prisma: PrismaService,
  serviceId: string,
  input: UpdateServiceInput,
  context: CatalogMutationContext,
): Promise<ServiceResponse> {
  const current = await loadService(prisma, serviceId);
  const name =
    input.name === undefined ? current.name : normalizeServiceName(input.name);
  const categoryId = input.categoryId ?? current.categoryId;
  if (categoryId !== current.categoryId) {
    await assertServiceCategoryExists(prisma, categoryId);
  }
  const policyPackId =
    input.policyPackId === undefined ? current.policyPackId : input.policyPackId;
  await assertPolicyPackExists(prisma, policyPackId);
  const updated = await prisma.$transaction(async (transaction) => {
    const service = await transaction.service.update({
      where: { id: serviceId },
      data: {
        name,
        categoryId,
        classification: input.classification ?? current.classification,
        requiresApproval: input.requiresApproval ?? current.requiresApproval,
        isConfidentialDefault:
          input.isConfidentialDefault ?? current.isConfidentialDefault,
        autoAssignStrategy: input.autoAssignStrategy ?? current.autoAssignStrategy,
        policyPackId,
      },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceChangeLogEntityType(),
      entityId: service.id,
      reason: 'update',
      diff: {
        before: { name: current.name, categoryId: current.categoryId },
        after: { name, categoryId, slug: current.slug },
      },
      actorUserId: context.actorUserId,
    });
    return service;
  });
  return toServiceResponse(updated);
}
