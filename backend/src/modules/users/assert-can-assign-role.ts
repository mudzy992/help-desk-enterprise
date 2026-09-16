import { authenticationConstants } from '../authentication/authentication.constants';
import { UsersError } from './users.error';

export function assertCanAssignRole(input: {
  readonly roleKey: string;
  readonly actorIsSuperAdmin: boolean;
}): void {
  if (
    input.roleKey === authenticationConstants.superAdminRoleKey &&
    !input.actorIsSuperAdmin
  ) {
    throw new UsersError('SUPER_ADMIN_GRANT_FORBIDDEN');
  }
}
