import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { loadActorGroupIds } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
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

/** True when the actor holds an AGENT or ADMIN role anywhere. */
export function hasTicketStaffRole(context: AuthorizationContext): boolean {
  return context.assignments.some(
    (assignment) =>
      assignment.roleKey === authorizationRoleKeys.agent ||
      assignment.roleKey === authorizationRoleKeys.admin,
  );
}

/**
 * Decision D1 (package 1.1): members of the group a ticket is currently
 * assigned to handle it with staff rights, whatever OU the ticket came from.
 * This is what makes a ticket forwarded from OU Zenica to a group in OU
 * Direkcija workable for that group. The right ends when the ticket moves on.
 * Group ids come from the per-request scope cache, so no extra query when the
 * list or the confidential check already loaded them.
 */
export async function isActiveHandlerGroupMember(
  prisma: PrismaService,
  context: AuthorizationContext,
  assignedGroupId: string | null,
): Promise<boolean> {
  if (assignedGroupId === null || !hasTicketStaffRole(context)) {
    return false;
  }
  const groupIds = await loadActorGroupIds(prisma, context.subjectId);
  return groupIds.includes(assignedGroupId);
}

/** OU/service scope, or D1 handler-group membership. SuperAdmin always. */
export async function canHandleTicket(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly originUnitId: string;
    readonly originUnitPath: string;
    readonly serviceId: string;
    readonly assignedGroupId: string | null;
  },
): Promise<boolean> {
  if (input.context.isSuperAdmin) {
    return true;
  }
  if (canManageTicketsInScope(input)) {
    return true;
  }
  return isActiveHandlerGroupMember(
    prisma,
    input.context,
    input.assignedGroupId,
  );
}

export async function assertTicketVisible(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly requesterId: string;
    readonly originUnitId: string;
    readonly originUnitPath: string;
    readonly serviceId: string;
    readonly assignedGroupId: string | null;
  },
): Promise<void> {
  if (input.context.subjectId === input.requesterId) {
    return;
  }
  if (await canHandleTicket(prisma, input)) {
    return;
  }
  throw new TicketsError('FORBIDDEN');
}
