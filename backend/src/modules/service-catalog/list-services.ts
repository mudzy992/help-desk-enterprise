import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import { loadServiceDowntimeWindowsForServices } from './load-service-downtime-windows';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import type { ServiceAvailabilityEvaluationContext } from './service-availability.types';
import type { ListServicesInput, ServiceResponse } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function listServices(
  prisma: PrismaService,
  input: ListServicesInput = {},
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
): Promise<readonly ServiceResponse[]> {
  const records = await prisma.service.findMany({
    where: {
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    },
    orderBy: [{ name: 'asc' }],
  });
  const windowsByServiceId = await loadServiceDowntimeWindowsForServices(
    prisma,
    records.map((record) => record.id),
  );
  const mapped = records.map((record) =>
    toServiceResponse(
      record,
      windowsByServiceId.get(record.id) ?? [],
      evaluation,
    ),
  );
  if (input.offeredOnly !== true) {
    return mapped;
  }
  return mapped.filter((service) => isServiceOfferedToRequesters(service.lifecycle));
}
