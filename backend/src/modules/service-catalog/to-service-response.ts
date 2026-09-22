import { evaluateServiceRuntimeAvailability } from './evaluate-service-runtime-availability';
import { defaultServiceAvailabilityEvaluationContext } from './parse-service-availability-configuration';
import type {
  DowntimeWindowRecord,
  ServiceAvailabilityEvaluationContext,
} from './service-availability.types';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import { defaultTicketApprovalsConfiguration } from '../tickets/approvals/approvals.constants';
import { resolveTicketApprovalRequirement } from '../tickets/approvals/resolve-ticket-approval-requirement';
import type { TicketApprovalsConfiguration } from '../tickets/approvals/approvals.types';
import type { ServiceRecord, ServiceResponse } from './service-catalog.types';

export function toServiceResponse(
  record: ServiceRecord,
  downtimeWindows: readonly DowntimeWindowRecord[] = [],
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  openTicketCount = 0,
  // Default matches "no overlay configured": approvalSteps then mirrors the
  // service's own `requiresApproval`. Callers on the read path (list/get)
  // pass the live configuration so an admin override is reflected too.
  approvalsConfiguration: TicketApprovalsConfiguration = defaultTicketApprovalsConfiguration,
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
    approvalSteps: resolveTicketApprovalRequirement({
      configuration: approvalsConfiguration,
      serviceId: record.id,
      serviceRequiresApproval: record.requiresApproval,
    })
      ? 1
      : 0,
    isConfidentialDefault: record.isConfidentialDefault,
    autoAssignStrategy: record.autoAssignStrategy,
    slaProfileId: record.slaProfileId,
    policyPackId: record.policyPackId,
    openTicketCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
