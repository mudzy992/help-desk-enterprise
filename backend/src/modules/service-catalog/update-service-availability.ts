import { PrismaService } from '../../common/prisma/prisma.service';
import { buildServiceResponse } from './build-service-response';
import { loadService } from './load-service';
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
  configuration: ServiceAvailabilityConfigurationBundle,
  context: CatalogMutationContext,
  evaluation: ServiceAvailabilityEvaluationContext,
): Promise<ServiceResponse> {
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
  const current = await loadService(prisma, serviceId);
  const updated = await prisma.$transaction(async (transaction) => {
    const service = await transaction.service.update({
      where: { id: serviceId },
      data: { availability: input.availability },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
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
    return service;
  });
  return buildServiceResponse(prisma, updated, evaluation);
}
