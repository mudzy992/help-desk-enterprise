import type { AuthorizationContext } from '../authorization/authorization.types';
import { permissionKeys } from '../authorization/authorization.constants';

export type TemplateScope = {
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly groupIds: readonly string[];
};

export type TicketScopeFacts = {
  readonly serviceId: string;
  readonly categoryId: string | null;
  readonly assignedGroupId: string | null;
};

/**
 * T5 ranking: 3 = service match, 2 = category, 1 = group, 0 = global,
 * -1 = scoped elsewhere (offered only with "show all").
 */
export function scoreTemplateScope(scope: TemplateScope, ticket: TicketScopeFacts | null): number {
  const global =
    scope.serviceIds.length === 0 && scope.categoryIds.length === 0 && scope.groupIds.length === 0;
  if (global) return 0;
  if (ticket === null) return -1;
  if (scope.serviceIds.includes(ticket.serviceId)) return 3;
  if (ticket.categoryId !== null && scope.categoryIds.includes(ticket.categoryId)) return 2;
  if (ticket.assignedGroupId !== null && scope.groupIds.includes(ticket.assignedGroupId)) return 1;
  return -1;
}

export function hasPermission(context: AuthorizationContext, key: string): boolean {
  return (
    context.isSuperAdmin ||
    context.assignments.some((assignment) => assignment.permissionKeys.includes(key))
  );
}

/**
 * A2: who may create/edit a *shared* template or playbook with this scope.
 * - SUPER_ADMIN, or a `manage` assignment without a service restriction →
 *   any scope, global included;
 * - service-restricted `manage` assignments → only scopes made purely of
 *   their services (no global, category or group scope: those reach tickets
 *   of services the admin does not own).
 */
export function canManageSharedScope(context: AuthorizationContext, scope: TemplateScope): boolean {
  if (context.isSuperAdmin) return true;
  const manage = context.assignments.filter((assignment) =>
    assignment.permissionKeys.includes(permissionKeys.ticketTemplatesManage),
  );
  if (manage.length === 0) return false;
  if (manage.some((assignment) => assignment.serviceId === null)) return true;
  if (scope.serviceIds.length === 0 || scope.categoryIds.length > 0 || scope.groupIds.length > 0) {
    return false;
  }
  const allowed = new Set(manage.map((assignment) => assignment.serviceId));
  return scope.serviceIds.every((serviceId) => allowed.has(serviceId));
}
