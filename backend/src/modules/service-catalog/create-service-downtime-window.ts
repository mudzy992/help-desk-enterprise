import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDowntimeWindowRange } from './assert-downtime-window-range';
import { assertDowntimeWindowsDoNotOverlap } from './assert-downtime-windows-do-not-overlap';
import { buildServiceResponse } from './build-service-response';
import { loadService } from './load-service';
import { loadServiceDowntimeWindows } from './load-service-downtime-windows';
import { normalizeChangeReason } from './normalize-change-reason';
import { normalizeDowntimeMessage } from './normalize-downtime-message';
import { parseDowntimeInstant } from './parse-downtime-instant';
import {
  recordServiceCatalogChange,
  serviceDowntimeWindowChangeLogEntityType,
} from './record-service-catalog-change';
import { serviceAvailabilityChangeLogReasons } from './service-availability.constants';
import type {
  CreateServiceDowntimeWindowInput,
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
} from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext, ServiceResponse } from './service-catalog.types';

export async function createServiceDowntimeWindow(
  prisma: PrismaService,
  serviceId: string,
  input: CreateServiceDowntimeWindowInput,
  configuration: ServiceAvailabilityConfigurationBundle,
  context: CatalogMutationContext,
  evaluation: ServiceAvailabilityEvaluationContext,
): Promise<ServiceResponse> {
  if (!configuration.downtime.enabled) {
    throw new ServiceCatalogError('DOWNTIME_DISABLED');
  }
  const startsAt = parseDowntimeInstant(input.startsAt);
  const endsAt = parseDowntimeInstant(input.endsAt);
  assertDowntimeWindowRange(startsAt, endsAt);
  const message = normalizeDowntimeMessage(input.message);
  const reason = normalizeChangeReason({
    reason: input.reason,
    required: configuration.downtime.requireReason,
    fallback: serviceAvailabilityChangeLogReasons.downtimeWindowCreate,
  });
  const service = await loadService(prisma, serviceId);
  const existingWindows = await loadServiceDowntimeWindows(prisma, serviceId);
  assertDowntimeWindowsDoNotOverlap({
    existingWindows,
    candidate: { startsAt, endsAt },
  });
  await prisma.$transaction(async (transaction) => {
    const created = await transaction.serviceDowntimeWindow.create({
      data: {
        serviceId,
        startsAt,
        endsAt,
        message,
      },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceDowntimeWindowChangeLogEntityType(),
      entityId: created.id,
      reason,
      diff: {
        action: serviceAvailabilityChangeLogReasons.downtimeWindowCreate,
        serviceId,
        after: {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          message,
        },
      },
      actorUserId: context.actorUserId,
    });
  });
  return buildServiceResponse(prisma, service, evaluation);
}
