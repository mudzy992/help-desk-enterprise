import { PrismaService } from "../../common/prisma/prisma.service";
import { countOpenTicketsByService } from "./count-open-tickets-by-service";
import { defaultTicketApprovalsConfiguration } from "../tickets/approvals/approvals.constants";
import { emptyServiceActiveFormSummary } from "./empty-service-active-form-summary";
import { loadActiveFormSummaries } from "./load-active-form-summaries";
import { loadServiceDowntimeSummary } from "./load-service-downtime-summary";
import { defaultServiceAvailabilityEvaluationContext } from "./parse-service-availability-configuration";
import type { ServiceAvailabilityEvaluationContext } from "./service-availability.types";
import type { ServiceRecord, ServiceResponse } from "./service-catalog.types";
import { toServiceResponse } from "./to-service-response";

export async function buildServiceResponse(
  prisma: PrismaService,
  record: ServiceRecord,
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
): Promise<ServiceResponse> {
  const [downtimeSummary, openTicketCounts, activeForms] = await Promise.all([
    loadServiceDowntimeSummary(prisma, record.id, evaluation.now),
    countOpenTicketsByService(prisma, [record.id]),
    loadActiveFormSummaries(prisma, [record.id]),
  ]);
  return toServiceResponse(
    record,
    downtimeSummary.windows,
    evaluation,
    openTicketCounts.get(record.id) ?? 0,
    defaultTicketApprovalsConfiguration,
    null,
    activeForms.get(record.id) ?? emptyServiceActiveFormSummary,
    downtimeSummary.upcomingCount,
  );
}
