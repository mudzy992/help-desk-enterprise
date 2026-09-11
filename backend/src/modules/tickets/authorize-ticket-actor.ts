import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TicketsError } from './tickets.error';

export function canManageTicketsInScope(input: {
  readonly context: AuthorizationContext;
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
}): boolean {
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: [
      authorizationRoleKeys.agent,
      authorizationRoleKeys.admin,
    ],
    requiredPermissions: [],
    organizationalUnitId: input.originUnitId,
    organizationalUnitPath: input.originUnitPath,
    serviceId: input.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function canChangeTicketStatus(context: AuthorizationContext): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.assignments.some(
    (assignment) =>
      assignment.roleKey === authorizationRoleKeys.agent ||
      assignment.roleKey === authorizationRoleKeys.admin,
  );
}

export function assertTicketVisible(input: {
  readonly context: AuthorizationContext;
  readonly requesterId: string;
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
}): void {
  if (input.context.subjectId === input.requesterId) {
    return;
  }
  if (input.context.isSuperAdmin) {
    return;
  }
  if (
    canManageTicketsInScope({
      context: input.context,
      originUnitId: input.originUnitId,
      originUnitPath: input.originUnitPath,
      serviceId: input.serviceId,
    })
  ) {
    return;
  }
  throw new TicketsError('FORBIDDEN');
}
