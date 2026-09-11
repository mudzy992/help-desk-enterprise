import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketApprovalsConfiguration } from './approvals.types';

export function resolveTicketApprovalRequirement(input: {
  readonly configuration: TicketApprovalsConfiguration;
  readonly serviceId: string;
  readonly serviceRequiresApproval: boolean;
}): boolean {
  if (!input.configuration.enabled) {
    return false;
  }
  const overlay = input.configuration.requiredByService[input.serviceId];
  if (overlay !== undefined) {
    return overlay;
  }
  return input.serviceRequiresApproval;
}

export function resolveCreateTicketApprovalStatus(input: {
  readonly routingStatus: TicketStatus;
  readonly requiresApproval: boolean;
}): TicketStatus {
  if (!input.requiresApproval || input.routingStatus === 'UNROUTED') {
    return input.routingStatus;
  }
  return 'PENDING_APPROVAL';
}
