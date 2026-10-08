import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import { requestedServiceLifecycles } from './service-visible-lifecycles';
import { countOpenTicketsByService } from './count-open-tickets-by-service';
import { loadActiveFormSummaries } from './load-active-form-summaries';
import { loadServiceCategoryLabels } from './load-service-category-labels';
import { loadServiceDowntimeWindowsForServices } from './load-service-downtime-windows';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import { defaultTicketApprovalsConfiguration } from '../tickets/approvals/approvals.constants';
import type { TicketApprovalsConfiguration } from '../tickets/approvals/approvals.types';
import type { ServiceAvailabilityEvaluationContext } from './service-availability.types';
import type { ListServicesInput, ServiceResponse } from './service-catalog.types';
import { loadOpenIncidentImpacts } from './load-open-incident-impacts';
import { toServiceResponse } from './to-service-response';

export async function listServices(
  prisma: PrismaService,
  input: ListServicesInput = {},
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  approvalsConfiguration: TicketApprovalsConfiguration = defaultTicketApprovalsConfiguration,
): Promise<readonly ServiceResponse[]> {
  // Val 2 (M6/B2): drafts (and, for requesters, deprecated services) are filtered
  // in the query itself, not after mapping — a caller asking for a state they may
  // not see gets an empty list instead of a 403 that would reveal it exists.
  const lifecycles = requestedServiceLifecycles(input);
  if (lifecycles.length === 0) {
    return [];
  }
  const records = await prisma.service.findMany({
    where: {
      lifecycle: { in: [...lifecycles] },
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    },
    orderBy: [{ name: 'asc' }],
  });
  const serviceIds = records.map((record) => record.id);
  const [windowsByServiceId, openTicketCounts, incidentImpacts, activeForms, categoryLabels] = await Promise.all([
    loadServiceDowntimeWindowsForServices(prisma, serviceIds),
    countOpenTicketsByService(prisma, serviceIds),
    loadOpenIncidentImpacts(prisma, serviceIds),
    loadActiveFormSummaries(prisma, serviceIds),
    loadServiceCategoryLabels(prisma, records.map((record) => record.categoryId)),
  ]);
  const mapped = records.map((record): ServiceResponse => ({
    ...toServiceResponse(
      record,
      windowsByServiceId.get(record.id) ?? [],
      evaluation,
      openTicketCounts.get(record.id) ?? 0,
      approvalsConfiguration,
      incidentImpacts.get(record.id) ?? null,
      activeForms.get(record.id) ?? undefined,
    ),
    category: categoryLabels.get(record.categoryId) ?? null,
  }));
  if (input.offeredOnly !== true) {
    return mapped;
  }
  return mapped.filter((service) => isServiceOfferedToRequesters(service.lifecycle));
}
