import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import { countOpenTicketsByService } from './count-open-tickets-by-service';
import { loadServiceDowntimeWindowsForServices } from './load-service-downtime-windows';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import { defaultTicketApprovalsConfiguration } from '../tickets/approvals/approvals.constants';
import type { TicketApprovalsConfiguration } from '../tickets/approvals/approvals.types';
import type { ServiceAvailabilityEvaluationContext } from './service-availability.types';
import type { ListServicesInput, ServiceResponse } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function listServices(
  prisma: PrismaService,
  input: ListServicesInput = {},
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  approvalsConfiguration: TicketApprovalsConfiguration = defaultTicketApprovalsConfiguration,
): Promise<readonly ServiceResponse[]> {
  const records = await prisma.service.findMany({
    where: {
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    },
    orderBy: [{ name: 'asc' }],
  });
  const serviceIds = records.map((record) => record.id);
  const [windowsByServiceId, openTicketCounts] = await Promise.all([
    loadServiceDowntimeWindowsForServices(prisma, serviceIds),
    countOpenTicketsByService(prisma, serviceIds),
  ]);
  const mapped = records.map((record) =>
    toServiceResponse(
      record,
      windowsByServiceId.get(record.id) ?? [],
      evaluation,
      openTicketCounts.get(record.id) ?? 0,
      approvalsConfiguration,
    ),
  );
  if (input.offeredOnly !== true) {
    return mapped;
  }
  return mapped.filter((service) => isServiceOfferedToRequesters(service.lifecycle));
}
