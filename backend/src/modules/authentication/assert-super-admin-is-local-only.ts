import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';

export function assertSuperAdminIsLocalOnly(input: {
  readonly isLocalOnly: boolean;
  readonly entraObjectId?: string | null;
  readonly roleKeys: readonly string[];
}): void {
  if (!input.roleKeys.includes(authenticationConstants.superAdminRoleKey)) {
    return;
  }
  if (!input.isLocalOnly) {
    throw new AuthenticationError('SUPER_ADMIN_MUST_BE_LOCAL_ONLY');
  }
  if (input.entraObjectId !== undefined && input.entraObjectId !== null) {
    throw new AuthenticationError('SUPER_ADMIN_CANNOT_HAVE_EXTERNAL_IDENTITY');
  }
}
