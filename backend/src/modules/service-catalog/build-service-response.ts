import { PrismaService } from '../../common/prisma/prisma.service';
import { countOpenTicketsByService } from './count-open-tickets-by-service';
import { loadServiceDowntimeWindows } from './load-service-downtime-windows';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import type { ServiceAvailabilityEvaluationContext } from './service-availability.types';
import type { ServiceRecord, ServiceResponse } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function buildServiceResponse(
  prisma: PrismaService,
  record: ServiceRecord,
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
): Promise<ServiceResponse> {
  const [downtimeWindows, openTicketCounts] = await Promise.all([
    loadServiceDowntimeWindows(prisma, record.id),
    countOpenTicketsByService(prisma, [record.id]),
  ]);
  return toServiceResponse(
    record,
    downtimeWindows,
    evaluation,
    openTicketCounts.get(record.id) ?? 0,
  );
}
