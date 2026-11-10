import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import {
  announcementPermissionScopeFromAssignments,
  type AnnouncementPermissionScope,
} from './announcement-permission-scope';

export type AnnouncementViewer = {
  readonly userId: string;
  readonly roleKeys: readonly string[];
  readonly groupIds: readonly string[];
  readonly homeOrganizationalUnitId: string | null;
  readonly authorizationPrincipal: AuthorizationPrincipal | null;
  readonly manageScope: AnnouncementPermissionScope;
  readonly reportScope: AnnouncementPermissionScope;
  /** True only for a truly global grant or a local SuperAdmin bypass. */
  readonly canManageAll: boolean;
  /** True only for a truly global grant or a local SuperAdmin bypass. */
  readonly canReadReports: boolean;
  /** AGENT role: may manage own-unit announcements when the setting allows it. */
  readonly isAgent: boolean;
};

const noScope: AnnouncementPermissionScope = { global: false, organizationalUnits: [] };

export function announcementViewerFromContext(context: PrincipalContext | null, userId: string): AnnouncementViewer {
  if (context === null) {
    return {
      userId,
      roleKeys: [],
      groupIds: [],
      homeOrganizationalUnitId: null,
      authorizationPrincipal: null,
      manageScope: noScope,
      reportScope: noScope,
      canManageAll: false,
      canReadReports: false,
      isAgent: false,
    };
  }
  const roles = [...new Set([...context.roleKeys, ...context.assignments.map((assignment) => assignment.roleKey)])];
  const isSuperAdmin = roles.includes(authorizationRoleKeys.superAdmin);
  const manageScope = announcementPermissionScopeFromAssignments({
    assignments: context.assignments,
    permissionKey: permissionKeys.announcementManage,
    isSuperAdmin,
    isLocalOnly: context.isLocalOnly,
  });
  const reportScope = announcementPermissionScopeFromAssignments({
    assignments: context.assignments,
    permissionKey: permissionKeys.announcementReportRead,
    isSuperAdmin,
    isLocalOnly: context.isLocalOnly,
  });
  return {
    userId,
    roleKeys: roles,
    groupIds: context.groupIds,
    homeOrganizationalUnitId: context.homeOrganizationalUnitId,
    authorizationPrincipal: {
      subjectId: context.subjectId,
      email: context.email,
      displayName: context.displayName,
      isLocalOnly: context.isLocalOnly,
    },
    manageScope,
    reportScope,
    canManageAll: manageScope.global,
    canReadReports: reportScope.global,
    isAgent: roles.includes(authorizationRoleKeys.agent),
  };
}

export function announcementViewerOf(request: AuthenticatedHttpRequest, userId: string): AnnouncementViewer {
  return announcementViewerFromContext(readPrincipalContext(request), userId);
}
