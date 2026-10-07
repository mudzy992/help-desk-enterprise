import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertPolicyPackExists } from './assert-policy-pack-exists';
import { assertServiceCategoryExists } from './assert-service-category-exists';
import { assertSlaProfileExists } from './assert-sla-profile-exists';
import { buildServiceResponse } from './build-service-response';
import {
  buildServiceMutationDiff,
  hasServiceMutationChanges,
} from './build-service-mutation-diff';
import { loadService } from './load-service';
import { normalizeServiceName } from './normalize-service-name';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogError } from './service-catalog.error';
import type {
  CatalogMutationContext,
  ServiceResponse,
  UpdateServiceInput,
} from './service-catalog.types';

export async function updateService(
  prisma: PrismaService,
  serviceId: string,
  input: UpdateServiceInput,
  context: CatalogMutationContext,
): Promise<ServiceResponse> {
  const current = await loadService(prisma, serviceId);
  if ('slug' in input && input.slug !== undefined && input.slug !== current.slug) {
    throw new ServiceCatalogError('SLUG_IMMUTABLE');
  }
  const name =
    input.name === undefined ? current.name : normalizeServiceName(input.name);
  const categoryId = input.categoryId ?? current.categoryId;
  if (categoryId !== current.categoryId) {
    await assertServiceCategoryExists(prisma, categoryId);
  }
  const policyPackId =
    input.policyPackId === undefined ? current.policyPackId : input.policyPackId;
  const slaProfileId =
    input.slaProfileId === undefined ? current.slaProfileId : input.slaProfileId;
  await assertPolicyPackExists(prisma, policyPackId);
  await assertSlaProfileExists(prisma, slaProfileId);
  const next = {
    name,
    categoryId,
    classification: input.classification ?? current.classification,
    requiresApproval: input.requiresApproval ?? current.requiresApproval,
    isConfidentialDefault:
      input.isConfidentialDefault ?? current.isConfidentialDefault,
    autoAssignStrategy: input.autoAssignStrategy ?? current.autoAssignStrategy,
    policyPackId,
    slaProfileId,
  };
  const changed = hasServiceMutationChanges(
    { ...input, slaProfileId },
    { ...current, slaProfileId: current.slaProfileId },
  );
  const updated = await prisma.$transaction(async (transaction) => {
    const service = await transaction.service.update({
      where: { id: serviceId },
      data: next,
    });
    if (changed) {
      await recordServiceCatalogChange(transaction as PrismaService, {
        entityType: serviceChangeLogEntityType(),
        entityId: service.id,
        reason: input.reason.trim(),
        diff: buildServiceMutationDiff(current, next) as unknown as Prisma.InputJsonValue,
        actorUserId: context.actorUserId,
      });
    }
    return service;
  });
  return buildServiceResponse(prisma, updated);
}
