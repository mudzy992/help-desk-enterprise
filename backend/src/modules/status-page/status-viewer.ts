import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
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

function scopeFromAssignments(assignments: PrincipalContext['assignments']): StatusViewerScope {
  return {
    global: assignments.some((assignment) => assignment.organizationalUnitId === null && assignment.serviceId === null),
    serviceIds: [...new Set(assignments.map((assignment) => assignment.serviceId).filter((value): value is string => value !== null))],
    organizationalUnitPaths: [...new Set(assignments.map((assignment) => assignment.organizationalUnitPath).filter((value): value is string => value !== null))],
  };
}
