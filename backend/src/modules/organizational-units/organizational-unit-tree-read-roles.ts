import { authorizationRoleKeys } from '../authorization/authorization.constants';

export const organizationalUnitTreeReadRoles = [
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
] as const;
