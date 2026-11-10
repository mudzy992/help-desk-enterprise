import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDowntimeWindowRange } from './assert-downtime-window-range';
import { assertDowntimeWindowsDoNotOverlap } from './assert-downtime-windows-do-not-overlap';
import { buildServiceResponse } from './build-service-response';
import { loadService } from './load-service';
import { loadServiceDowntimeWindow } from './load-service-downtime-window';
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
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
  UpdateServiceDowntimeWindowInput,
} from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext, ServiceResponse } from './service-catalog.types';

export async function updateServiceDowntimeWindow(
  prisma: PrismaService,
  serviceId: string,
  downtimeWindowId: string,
  input: UpdateServiceDowntimeWindowInput,
  configuration: ServiceAvailabilityConfigurationBundle,
  context: CatalogMutationContext,
  evaluation: ServiceAvailabilityEvaluationContext,
): Promise<ServiceResponse> {
  if (!configuration.downtime.enabled) {
    throw new ServiceCatalogError('DOWNTIME_DISABLED');
  }
  const current = await loadServiceDowntimeWindow(
    prisma,
    serviceId,
    downtimeWindowId,
  );
  const startsAt =
    input.startsAt === undefined
      ? current.startsAt
      : parseDowntimeInstant(input.startsAt);
  const endsAt =
    input.endsAt === undefined ? current.endsAt : parseDowntimeInstant(input.endsAt);
  assertDowntimeWindowRange(startsAt, endsAt);
  const message =
    input.message === undefined
      ? current.message
      : normalizeDowntimeMessage(input.message);
  const reason = normalizeChangeReason({
    reason: input.reason,
    required: configuration.downtime.requireReason,
    fallback: serviceAvailabilityChangeLogReasons.downtimeWindowUpdate,
  });
  const existingWindows = (await loadServiceDowntimeWindows(prisma, serviceId)).filter(
    (window) => window.id !== downtimeWindowId,
  );
  assertDowntimeWindowsDoNotOverlap({
    existingWindows,
    candidate: { startsAt, endsAt },
  });
  const service = await loadService(prisma, serviceId);
  await prisma.$transaction(async (transaction) => {
    await transaction.serviceDowntimeWindow.update({
      where: { id: downtimeWindowId },
      data: { startsAt, endsAt, message },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceDowntimeWindowChangeLogEntityType(),
      entityId: downtimeWindowId,
      reason,
      diff: {
        action: serviceAvailabilityChangeLogReasons.downtimeWindowUpdate,
        serviceId,
        before: {
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          message: current.message,
        },
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
