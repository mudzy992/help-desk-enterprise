import { PrismaService } from "../../common/prisma/prisma.service";
import { countOpenTicketsByService } from "./count-open-tickets-by-service";
import { loadActiveFormSummaries } from "./load-active-form-summaries";
import { loadService } from "./load-service";
import { loadServiceDowntimeSummary } from "./load-service-downtime-summary";
import { defaultServiceAvailabilityEvaluationContext } from "./parse-service-availability-configuration";
import { defaultTicketApprovalsConfiguration } from "../tickets/approvals/approvals.constants";
import type { TicketApprovalsConfiguration } from "../tickets/approvals/approvals.types";
import type { ServiceAvailabilityEvaluationContext } from "./service-availability.types";
import type { ServiceResponse } from "./service-catalog.types";
import { loadOpenIncidentImpacts } from "./load-open-incident-impacts";
import { isServiceLifecycleVisible } from "./service-visible-lifecycles";
import { ServiceCatalogError } from "./service-catalog.error";
import { toServiceResponse } from "./to-service-response";

export async function getService(
  prisma: PrismaService,
  serviceId: string,
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  approvalsConfiguration: TicketApprovalsConfiguration = defaultTicketApprovalsConfiguration,
  /** Val 2 (M6/B2): `undefined` (interno) znači bez provjere vidljivosti. */
  roleKeys?: readonly string[],
): Promise<ServiceResponse> {
  const record = await loadService(prisma, serviceId);
  // Val 2 (M6/B2): a hidden state answers like a missing service, so nobody can
  // learn from an error that a draft with this id exists.
  if (!isServiceLifecycleVisible(record.lifecycle, roleKeys)) {
    throw new ServiceCatalogError("NOT_FOUND");
  }
  const [downtimeSummary, openTicketCounts, incidentImpacts, activeForms] =
    await Promise.all([
      loadServiceDowntimeSummary(prisma, record.id, evaluation.now),
      countOpenTicketsByService(prisma, [record.id]),
      loadOpenIncidentImpacts(prisma, [record.id]),
      loadActiveFormSummaries(prisma, [record.id]),
    ]);
  return toServiceResponse(
    record,
    downtimeSummary.windows,
    evaluation,
    openTicketCounts.get(record.id) ?? 0,
    approvalsConfiguration,
    incidentImpacts.get(record.id) ?? null,
    activeForms.get(record.id) ?? undefined,
    downtimeSummary.upcomingCount,
  );
}
