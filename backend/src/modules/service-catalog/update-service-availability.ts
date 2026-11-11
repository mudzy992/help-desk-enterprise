import {
  parseIfMatch,
  type OptimisticConcurrencyService,
} from '../../common/optimistic-concurrency/optimistic-concurrency.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildServiceResponse } from './build-service-response';
import { normalizeChangeReason } from './normalize-change-reason';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { serviceAvailabilityChangeLogReasons } from './service-availability.constants';
import type {
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
  UpdateServiceAvailabilityInput,
} from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext, ServiceResponse } from './service-catalog.types';

export async function updateServiceAvailability(
  prisma: PrismaService,
  serviceId: string,
  input: UpdateServiceAvailabilityInput,
  ifMatch: string | string[] | undefined,
  configuration: ServiceAvailabilityConfigurationBundle,
  context: CatalogMutationContext,
  evaluation: ServiceAvailabilityEvaluationContext,
  optimisticConcurrency: OptimisticConcurrencyService,
): Promise<ServiceResponse> {
  parseIfMatch(ifMatch);
  if (!configuration.availability.enabled) {
    throw new ServiceCatalogError('AVAILABILITY_DISABLED');
  }
  if (!configuration.availability.allowedStatuses.includes(input.availability)) {
    throw new ServiceCatalogError('INVALID_AVAILABILITY_STATUS');
  }
  const reason = normalizeChangeReason({
    reason: input.reason,
    required: configuration.availability.changeRequiresReason,
    fallback: serviceAvailabilityChangeLogReasons.availabilityUpdate,
  });
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
        const write = await transaction.service.updateMany({
          where: { id: serviceId, revision: expectedRevision },
          data: {
            availability: input.availability,
            revision: { increment: 1 },
          },
        });
        if (write.count !== 1) {
          return null;
        }
        const service = await transaction.service.findUnique({
          where: { id: serviceId },
        });
        if (service === null) {
          throw new Error('Updated service disappeared before transaction commit');
        }
        await recordServiceCatalogChange(transactionPrisma, {
          entityType: serviceChangeLogEntityType(),
          entityId: service.id,
          reason,
          diff: {
            action: serviceAvailabilityChangeLogReasons.availabilityUpdate,
            before: {
              availability: current.availability,
              lifecycle: current.lifecycle,
            },
            after: {
              availability: service.availability,
              lifecycle: service.lifecycle,
            },
          },
          actorUserId: context.actorUserId,
        });
        return { value: service, version: service.revision };
      }),
    readCurrentVersion: async () => {
      const current = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { revision: true },
      });
      return current?.revision ?? null;
    },
  });
  return buildServiceResponse(prisma, result.value, evaluation);
}
