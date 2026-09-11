import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { approverRoleKeys } from './approvals.constants';
import type { TicketApprovalRecord, TicketApprovalsConfiguration } from './approvals.types';

export function canDecideTicketApproval(input: {
  readonly context: AuthorizationContext;
  readonly ticket: TicketRecord;
  readonly originUnitPath: string;
  readonly configuration: TicketApprovalsConfiguration;
}): boolean {
  if (!input.configuration.enabled) {
    return false;
  }
  if (input.ticket.status !== 'PENDING_APPROVAL') {
    return false;
  }
  if (input.context.subjectId === input.ticket.requesterId) {
    return false;
  }
  if (input.context.isSuperAdmin) {
    return true;
  }
  const requiredRoles = approverRoleKeys(
    input.configuration.defaultApproverRole,
  );
  if (requiredRoles.length === 0) {
    return false;
  }
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles,
    requiredPermissions: [],
    organizationalUnitId: input.ticket.originUnitId,
    organizationalUnitPath: input.originUnitPath,
    serviceId: input.ticket.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function assertCanDecideTicketApproval(input: {
  readonly context: AuthorizationContext;
  readonly ticket: TicketRecord;
  readonly approval: TicketApprovalRecord;
  readonly originUnitPath: string;
  readonly configuration: TicketApprovalsConfiguration;
}): void {
  if (!input.configuration.enabled) {
    throw new TicketsError('APPROVALS_DISABLED');
  }
  if (input.ticket.status !== 'PENDING_APPROVAL') {
    throw new TicketsError('APPROVAL_NOT_PENDING');
  }
  if (input.approval.status !== 'PENDING') {
    throw new TicketsError('APPROVAL_NOT_PENDING');
  }
  if (input.context.subjectId === input.ticket.requesterId) {
    throw new TicketsError('APPROVAL_SELF_FORBIDDEN');
  }
  if (
    !canDecideTicketApproval({
      context: input.context,
      ticket: input.ticket,
      originUnitPath: input.originUnitPath,
      configuration: input.configuration,
    })
  ) {
    throw new TicketsError('FORBIDDEN');
  }
}
