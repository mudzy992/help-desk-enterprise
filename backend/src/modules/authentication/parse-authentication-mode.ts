import { authenticationConstants } from './authentication.constants';
import { AuthenticationError } from './authentication.error';
import type { AuthenticationMode } from './authentication.types';

export function parseAuthenticationMode(value: unknown): AuthenticationMode {
  if (value === authenticationConstants.modes[0]) {
    return 'local';
  }
  if (value === authenticationConstants.modes[1]) {
    return 'entra_ad';
  }
  throw new AuthenticationError('UNSUPPORTED_AUTHENTICATION_MODE');
}
