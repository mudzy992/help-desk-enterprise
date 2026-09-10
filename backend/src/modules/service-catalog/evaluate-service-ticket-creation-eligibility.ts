import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluateServiceRuntimeAvailability } from './evaluate-service-runtime-availability';
import { evaluateTicketCreationAgainstAvailability } from './evaluate-ticket-creation-against-availability';
import { loadService } from './load-service';
import { loadServiceDowntimeWindows } from './load-service-downtime-windows';
import type {
  ServiceAvailabilityEvaluationContext,
  ServiceTicketCreationEligibility,
} from './service-availability.types';

export async function evaluateServiceTicketCreationEligibility(
  prisma: PrismaService,
  serviceId: string,
  evaluation: ServiceAvailabilityEvaluationContext,
): Promise<ServiceTicketCreationEligibility> {
  const record = await loadService(prisma, serviceId);
  const downtimeWindows = await loadServiceDowntimeWindows(prisma, record.id);
  return evaluateTicketCreationAgainstAvailability({
    serviceId: record.id,
    runtimeAvailability: evaluateServiceRuntimeAvailability({
      storedAvailability: record.availability,
      downtimeWindows,
      evaluation,
    }),
  });
}
