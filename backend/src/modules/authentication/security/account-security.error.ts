import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PasswordViolation } from './password-policy';

export type AccountSecurityErrorCode =
  | 'MFA_INVALID_CODE'
  | 'MFA_NOT_ENABLED'
  | 'MFA_ALREADY_ENABLED'
  | 'MFA_REQUIRED_CANNOT_DISABLE'
  | 'MFA_NOT_AVAILABLE'
  | 'MFA_ENROLLMENT_EXPIRED'
  | 'MFA_UNAVAILABLE'
  | 'MFA_TOO_MANY_ATTEMPTS'
  | 'INVALID_PASSWORD'
  | 'PASSWORD_REUSED'
  | 'CURRENT_PASSWORD_INVALID'
  | 'LOCAL_PASSWORD_NOT_AVAILABLE'
  | 'SESSION_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'FORBIDDEN_TARGET';

export class AccountSecurityError extends Error {
  constructor(
    readonly code: AccountSecurityErrorCode,
    readonly violations: readonly PasswordViolation[] = [],
  ) {
    super(code);
    this.name = 'AccountSecurityError';
  }
}

const messages: Record<AccountSecurityErrorCode, string> = {
  MFA_INVALID_CODE: 'The code is not valid',
  MFA_NOT_ENABLED: 'MFA is not enabled for this account',
  MFA_ALREADY_ENABLED: 'MFA is already enabled',
  MFA_REQUIRED_CANNOT_DISABLE: 'MFA is required for this account',
  MFA_NOT_AVAILABLE: 'MFA is not available for this account',
  MFA_ENROLLMENT_EXPIRED: 'The MFA set-up expired; start again',
  MFA_UNAVAILABLE: 'MFA is not configured on the server',
  MFA_TOO_MANY_ATTEMPTS: 'Too many attempts; try again later',
  INVALID_PASSWORD: 'Password does not meet requirements',
  PASSWORD_REUSED: 'The password was used recently',
  CURRENT_PASSWORD_INVALID: 'The current password is not correct',
  LOCAL_PASSWORD_NOT_AVAILABLE: 'This account has no local password',
  SESSION_NOT_FOUND: 'Session not found',
  USER_NOT_FOUND: 'User not found',
  FORBIDDEN_TARGET: 'Not allowed for this account',
};

export function mapAccountSecurityError(error: unknown): never {
  if (!(error instanceof AccountSecurityError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    ...(error.violations.length > 0 ? { details: { violations: error.violations } } : {}),
  };
  switch (error.code) {
    case 'MFA_INVALID_CODE':
    case 'CURRENT_PASSWORD_INVALID':
      throw new UnauthorizedException(body);
    case 'MFA_TOO_MANY_ATTEMPTS':
      throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    case 'MFA_UNAVAILABLE':
      throw new ServiceUnavailableException(body);
    case 'MFA_ALREADY_ENABLED':
      throw new ConflictException(body);
    case 'SESSION_NOT_FOUND':
    case 'USER_NOT_FOUND':
      throw new NotFoundException(body);
    case 'FORBIDDEN_TARGET':
    case 'MFA_REQUIRED_CANNOT_DISABLE':
    case 'MFA_NOT_AVAILABLE':
    case 'LOCAL_PASSWORD_NOT_AVAILABLE':
      throw new ForbiddenException(body);
    default:
      throw new BadRequestException(body);
  }
}
