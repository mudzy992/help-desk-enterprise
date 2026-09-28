import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { StatusViewer } from './status-page.service';

const staffRoleKeys = new Set<string>([authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin]);

/**
 * Paket 2.7 (§8.1): staff (AGENT, ADMIN, SUPER_ADMIN) also see STAFF_ONLY
 * incidents and author names; managing needs `status.incidents.manage`
 * (SUPER_ADMIN holds every permission implicitly). A missing principal
 * context degrades to the requester view - never to more.
 */
export function statusViewerOf(request: AuthenticatedHttpRequest, userId: string): StatusViewer {
  return statusViewerFromContext(readPrincipalContext(request), userId);
}

export function statusViewerFromContext(context: PrincipalContext | null, userId: string): StatusViewer {
  if (context === null) return { userId, isStaff: false, canManage: false };
  const roles = new Set([...context.roleKeys, ...context.assignments.map((assignment) => assignment.roleKey)]);
  const isSuperAdmin = roles.has(authorizationRoleKeys.superAdmin);
  return {
    userId,
    isStaff: [...roles].some((role) => staffRoleKeys.has(role)),
    canManage:
      isSuperAdmin ||
      context.assignments.some((assignment) => assignment.permissionKeys.includes(permissionKeys.statusIncidentsManage)),
  };
}
