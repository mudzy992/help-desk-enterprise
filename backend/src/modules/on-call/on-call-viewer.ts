import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

export type OnCallViewer = {
  readonly userId: string;
  readonly canRead: boolean;
  readonly canManage: boolean;
};

export function onCallViewerFromContext(context: PrincipalContext | null, userId: string): OnCallViewer {
  if (context === null) return { userId, canRead: false, canManage: false };
  const roles = new Set([...context.roleKeys, ...context.assignments.map((assignment) => assignment.roleKey)]);
  const isSuperAdmin = roles.has(authorizationRoleKeys.superAdmin);
  const has = (key: string) => context.assignments.some((assignment) => assignment.permissionKeys.includes(key));
  const canManage = isSuperAdmin || has(permissionKeys.onCallManage);
  return { userId, canManage, canRead: canManage || has(permissionKeys.onCallRead) };
}

export function onCallViewerOf(request: AuthenticatedHttpRequest, userId: string): OnCallViewer {
  return onCallViewerFromContext(readPrincipalContext(request), userId);
}
