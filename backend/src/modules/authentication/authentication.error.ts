export type AuthenticationErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNSUPPORTED_AUTHENTICATION_MODE'
  | 'AUTHENTICATION_UNAVAILABLE'
  | 'SUPER_ADMIN_MUST_BE_LOCAL_ONLY'
  | 'SUPER_ADMIN_CANNOT_HAVE_EXTERNAL_IDENTITY';

export class AuthenticationError extends Error {
  constructor(
    readonly code: AuthenticationErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export function createInvalidCredentialsError(): AuthenticationError {
  return new AuthenticationError('INVALID_CREDENTIALS');
}
