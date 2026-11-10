import { PrismaService } from "../../common/prisma/prisma.service";
import { evaluateServiceRuntimeAvailability } from "./evaluate-service-runtime-availability";
import { evaluateTicketCreationAgainstAvailability } from "./evaluate-ticket-creation-against-availability";
import { loadService } from "./load-service";
import { loadServiceDowntimeSummary } from "./load-service-downtime-summary";
import type {
  ServiceAvailabilityEvaluationContext,
  ServiceTicketCreationEligibility,
} from "./service-availability.types";

export async function evaluateServiceTicketCreationEligibility(
  prisma: PrismaService,
  serviceId: string,
  evaluation: ServiceAvailabilityEvaluationContext,
): Promise<ServiceTicketCreationEligibility> {
  const record = await loadService(prisma, serviceId);
  const downtimeSummary = await loadServiceDowntimeSummary(
    prisma,
    record.id,
    evaluation.now,
  );
  return evaluateTicketCreationAgainstAvailability({
    serviceId: record.id,
    runtimeAvailability: evaluateServiceRuntimeAvailability({
      storedAvailability: record.availability,
      downtimeWindows: downtimeSummary.windows,
      upcomingDowntimeCount: downtimeSummary.upcomingCount,
      evaluation,
    }),
  });
}
