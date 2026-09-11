import { authorizationRoleKeys } from '../authorization/authorization.constants';

export const catalogTicketCreateReadRoles = [
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
] as const;
