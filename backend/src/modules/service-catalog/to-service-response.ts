import { evaluateServiceRuntimeAvailability } from './evaluate-service-runtime-availability';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import type {
  DowntimeWindowRecord,
  ServiceAvailabilityEvaluationContext,
} from './service-availability.types';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import type { ServiceRecord, ServiceResponse } from './service-catalog.types';

export function toServiceResponse(
  record: ServiceRecord,
  downtimeWindows: readonly DowntimeWindowRecord[] = [],
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  openTicketCount = 0,
): ServiceResponse {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    categoryId: record.categoryId,
    lifecycle: record.lifecycle,
    offeredToRequesters: isServiceOfferedToRequesters(record.lifecycle),
    availability: record.availability,
    runtimeAvailability: evaluateServiceRuntimeAvailability({
      storedAvailability: record.availability,
      downtimeWindows,
      evaluation,
    }),
    classification: record.classification,
    requiresApproval: record.requiresApproval,
    isConfidentialDefault: record.isConfidentialDefault,
    autoAssignStrategy: record.autoAssignStrategy,
    slaProfileId: record.slaProfileId,
    policyPackId: record.policyPackId,
    openTicketCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
