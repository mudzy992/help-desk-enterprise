import { authenticationConstants } from './authentication.constants';

export function canBindExternalIdentity(input: {
  readonly isLocalOnly: boolean;
  readonly roleKeys: readonly string[];
}): boolean {
  if (input.isLocalOnly) {
    return false;
  }
  return !input.roleKeys.includes(authenticationConstants.superAdminRoleKey);
}
