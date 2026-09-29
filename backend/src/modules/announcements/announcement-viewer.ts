import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

export type AnnouncementViewer = {
  readonly userId: string;
  readonly roleKeys: readonly string[];
  readonly groupIds: readonly string[];
  readonly homeOrganizationalUnitId: string | null;
  /** announcement.manage (or SUPER_ADMIN): every announcement. */
  readonly canManageAll: boolean;
  readonly canReadReports: boolean;
  /** AGENT role: may manage own-unit announcements when the setting allows it. */
  readonly isAgent: boolean;
};

export function announcementViewerFromContext(context: PrincipalContext | null, userId: string): AnnouncementViewer {
  if (context === null) {
    return {
      userId,
      roleKeys: [],
      groupIds: [],
      homeOrganizationalUnitId: null,
      canManageAll: false,
      canReadReports: false,
      isAgent: false,
    };
  }
  const roles = [...new Set([...context.roleKeys, ...context.assignments.map((assignment) => assignment.roleKey)])];
  const isSuperAdmin = roles.includes(authorizationRoleKeys.superAdmin);
  const has = (key: string) => context.assignments.some((assignment) => assignment.permissionKeys.includes(key));
  const canManageAll = isSuperAdmin || has(permissionKeys.announcementManage);
  return {
    userId,
    roleKeys: roles,
    groupIds: context.groupIds,
    homeOrganizationalUnitId: context.homeOrganizationalUnitId,
    canManageAll,
    canReadReports: isSuperAdmin || has(permissionKeys.announcementReportRead),
    isAgent: roles.includes(authorizationRoleKeys.agent),
  };
}

export function announcementViewerOf(request: AuthenticatedHttpRequest, userId: string): AnnouncementViewer {
  return announcementViewerFromContext(readPrincipalContext(request), userId);
}
