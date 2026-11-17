import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationAssignment, AuthorizationContext } from '../authorization/authorization.types';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { StatusViewer, StatusViewerScope } from './status-page.service';

const staffRoleKeys = new Set<string>([authorizationRoleKeys.agent, authorizationRoleKeys.admin]);

/** Missing principal context degrades to the requester view, never to more. */
export function statusViewerOf(request: AuthenticatedHttpRequest, userId: string): StatusViewer {
  return statusViewerFromContext(readPrincipalContext(request), userId);
}

export function statusViewerFromContext(context: PrincipalContext | null, userId: string): StatusViewer {
  if (context === null) return { userId, isStaff: false, canManage: false, staffScope: null };
  if (context.roleKeys.includes(authorizationRoleKeys.superAdmin)) {
    return { userId, isStaff: true, canManage: true, staffScope: { global: true, serviceIds: [], organizationalUnitPaths: [] } };
  }
  const staffAssignments = context.assignments.filter((assignment) => staffRoleKeys.has(assignment.roleKey));
  const scope = scopeFromAssignments(staffAssignments);
  return {
    userId,
    isStaff: staffAssignments.length > 0,
    canManage: context.assignments.some((assignment) =>
      assignment.permissionKeys.includes(permissionKeys.statusIncidentsManage),
    ),
    staffScope: staffAssignments.length === 0 ? null : scope,
  };
}

/**
 * W7.29 (BA-problems-11): other modules (problems) reach the status page through
 * the authorization context rather than the HTTP request. They must see exactly
 * what `GET /status-page/incidents` would show them, so the viewer is derived
 * with the same rule instead of being widened to "staff can see everything".
 */
export function statusViewerFromAuthorizationContext(
  context: AuthorizationContext | null,
  userId: string,
): StatusViewer {
  if (context === null) return { userId, isStaff: false, canManage: false, staffScope: null };
  if (context.isSuperAdmin) {
    return { userId, isStaff: true, canManage: true, staffScope: { global: true, serviceIds: [], organizationalUnitPaths: [] } };
  }
  const staffAssignments = context.assignments.filter((assignment) => staffRoleKeys.has(assignment.roleKey));
  return {
    userId,
    isStaff: staffAssignments.length > 0,
    canManage: context.assignments.some((assignment) =>
      assignment.permissionKeys.includes(permissionKeys.statusIncidentsManage),
    ),
    staffScope: staffAssignments.length === 0 ? null : scopeFromAssignments(staffAssignments),
  };
}

function scopeFromAssignments(assignments: readonly AuthorizationAssignment[]): StatusViewerScope {
  return {
    global: assignments.some((assignment) => assignment.organizationalUnitId === null && assignment.serviceId === null),
    serviceIds: [...new Set(assignments.map((assignment) => assignment.serviceId).filter((value): value is string => value !== null))],
    organizationalUnitPaths: [...new Set(assignments.map((assignment) => assignment.organizationalUnitPath).filter((value): value is string => value !== null))],
  };
}
