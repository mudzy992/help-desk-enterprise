import { Prisma } from '../../generated/prisma/client';
import type { OptimisticConcurrencyService } from '../../common/optimistic-concurrency/optimistic-concurrency.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertPolicyPackExists } from './assert-policy-pack-exists';
import { assertServiceCategoryExists } from './assert-service-category-exists';
import { assertSlaProfileExists } from './assert-sla-profile-exists';
import { buildServiceResponse } from './build-service-response';
import {
  buildServiceMutationDiff,
  hasServiceMutationChanges,
} from './build-service-mutation-diff';
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
  ifMatch: string | string[] | undefined,
  context: CatalogMutationContext,
  optimisticConcurrency: OptimisticConcurrencyService,
): Promise<ServiceResponse> {
  const result = await optimisticConcurrency.execute({
    ifMatch,
    mutate: (expectedRevision) =>
      prisma.$transaction(async (transaction) => {
        const transactionPrisma = transaction as PrismaService;
        const current = await transaction.service.findUnique({
          where: { id: serviceId },
        });
        if (current === null || current.revision !== expectedRevision) {
          return null;
        }
        if ('slug' in input && input.slug !== undefined && input.slug !== current.slug) {
          throw new ServiceCatalogError('SLUG_IMMUTABLE');
        }
        const name =
          input.name === undefined ? current.name : normalizeServiceName(input.name);
        const categoryId = input.categoryId ?? current.categoryId;
        if (categoryId !== current.categoryId) {
          await assertServiceCategoryExists(transactionPrisma, categoryId);
        }
        const policyPackId =
          input.policyPackId === undefined ? current.policyPackId : input.policyPackId;
        const slaProfileId =
          input.slaProfileId === undefined ? current.slaProfileId : input.slaProfileId;
        await assertPolicyPackExists(transactionPrisma, policyPackId);
        await assertSlaProfileExists(transactionPrisma, slaProfileId);
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
          current,
        );
        const write = await transaction.service.updateMany({
          where: { id: serviceId, revision: expectedRevision },
          data: { ...next, revision: { increment: 1 } },
        });
        if (write.count !== 1) {
          return null;
        }
        const updated = await transaction.service.findUnique({
          where: { id: serviceId },
        });
        if (updated === null) {
          throw new Error('Updated service disappeared before transaction commit');
        }
        if (changed) {
          const changelogReason = (input.reason ?? 'update').trim();
          await recordServiceCatalogChange(transactionPrisma, {
            entityType: serviceChangeLogEntityType(),
            entityId: updated.id,
            reason: changelogReason,
            diff: buildServiceMutationDiff(current, updated) as unknown as Prisma.InputJsonValue,
            actorUserId: context.actorUserId,
          });
        }
        return { value: updated, version: updated.revision };
      }),
    readCurrentVersion: async () => {
      const current = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { revision: true },
      });
      return current?.revision ?? null;
    },
  });
  return buildServiceResponse(prisma, result.value);
}
