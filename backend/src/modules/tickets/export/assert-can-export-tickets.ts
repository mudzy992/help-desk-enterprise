import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { decideAuthorizationAccess } from '../../authorization/evaluate-authorization-access';
import { TicketsError } from '../tickets.error';

export function hasTicketExportGrant(context: AuthorizationContext): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.assignments.some((assignment) =>
    assignment.permissionKeys.includes(permissionKeys.auditExport),
  );
}

export function assertCanExportTickets(context: AuthorizationContext): void {
  if (!hasTicketExportGrant(context)) {
    throw new TicketsError('FORBIDDEN');
  }
}

/**
 * The export permission only counts inside the scope of the assignment that
 * grants it, so a ticket visible through a different, export-less assignment
 * is never exported.
 */
export function canExportTicketInScope(input: {
  readonly context: AuthorizationContext;
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
}): boolean {
  if (input.context.isSuperAdmin) {
    return true;
  }
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: [authorizationRoleKeys.agent, authorizationRoleKeys.admin],
    requiredPermissions: [permissionKeys.auditExport],
    organizationalUnitId: input.originUnitId,
    organizationalUnitPath: input.originUnitPath,
    serviceId: input.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}
