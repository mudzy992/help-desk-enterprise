import { authenticationConstants } from './authentication.constants';
import type { AuthenticationUserRecord } from './authentication.types';

export function selectLocalPasswordHashForVerification(
  user: AuthenticationUserRecord | null,
  requiresLocalOnly: boolean,
): string {
  if (user === null || user.localPasswordHash === null || !user.isActive) {
    return authenticationConstants.dummyLocalPasswordHash;
  }
  if (requiresLocalOnly && !user.isLocalOnly) {
    return authenticationConstants.dummyLocalPasswordHash;
  }
  return user.localPasswordHash;
}

export function isAcceptedLocalPasswordAuthentication(
  user: AuthenticationUserRecord | null,
  isPasswordMatch: boolean,
  requiresLocalOnly: boolean,
): user is AuthenticationUserRecord {
  if (
    !isPasswordMatch ||
    user === null ||
    !user.isActive ||
    user.localPasswordHash === null
  ) {
    return false;
  }
  if (requiresLocalOnly && !user.isLocalOnly) {
    return false;
  }
  return true;
}
