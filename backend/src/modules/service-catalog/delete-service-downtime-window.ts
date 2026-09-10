import { PrismaService } from '../../common/prisma/prisma.service';
import { buildServiceResponse } from './build-service-response';
import { loadService } from './load-service';
import { loadServiceDowntimeWindow } from './load-service-downtime-window';
import { normalizeChangeReason } from './normalize-change-reason';
import {
  recordServiceCatalogChange,
  serviceDowntimeWindowChangeLogEntityType,
} from './record-service-catalog-change';
import { serviceAvailabilityChangeLogReasons } from './service-availability.constants';
import type {
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
} from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext, ServiceResponse } from './service-catalog.types';

export async function deleteServiceDowntimeWindow(
  prisma: PrismaService,
  serviceId: string,
  downtimeWindowId: string,
  configuration: ServiceAvailabilityConfigurationBundle,
  context: CatalogMutationContext,
  evaluation: ServiceAvailabilityEvaluationContext,
  reason?: string,
): Promise<ServiceResponse> {
  if (!configuration.downtime.enabled) {
    throw new ServiceCatalogError('DOWNTIME_DISABLED');
  }
  const current = await loadServiceDowntimeWindow(
    prisma,
    serviceId,
    downtimeWindowId,
  );
  const changelogReason = normalizeChangeReason({
    reason,
    required: configuration.downtime.requireReason,
    fallback: serviceAvailabilityChangeLogReasons.downtimeWindowDelete,
  });
  const service = await loadService(prisma, serviceId);
  await prisma.$transaction(async (transaction) => {
    await transaction.serviceDowntimeWindow.delete({
      where: { id: downtimeWindowId },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceDowntimeWindowChangeLogEntityType(),
      entityId: downtimeWindowId,
      reason: changelogReason,
      diff: {
        action: serviceAvailabilityChangeLogReasons.downtimeWindowDelete,
        serviceId,
        before: {
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          message: current.message,
        },
      },
      actorUserId: context.actorUserId,
    });
  });
  return buildServiceResponse(prisma, service, evaluation);
}
