import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { PolicyPackError } from './policy-pack.error';
import type { PolicyPackErrorCode } from './policy-pack.error';

const notFoundCodes: readonly PolicyPackErrorCode[] = [
  'UNKNOWN_POLICY_PACK',
  'UNKNOWN_ORGANIZATIONAL_UNIT',
  'UNKNOWN_SERVICE',
  'UNKNOWN_USER',
];

const messages: Record<PolicyPackErrorCode, string> = {
  UNKNOWN_POLICY_PACK: 'Policy pack was not found',
  INVALID_PACK_DEFINITION: 'Policy pack definition is invalid',
  SUPER_ADMIN_GRANT_FORBIDDEN: 'Policy packs must not grant SuperAdmin',
  UNKNOWN_ROLE: 'Policy pack references an unknown role',
  UNKNOWN_PERMISSION: 'Policy pack references an unknown permission',
  PERMISSION_NOT_ALLOWED_FOR_ROLE:
    'Policy pack permission is not allowed for the referenced role',
  MISSING_ORGANIZATIONAL_UNIT: 'Organizational unit is required for this pack',
  UNKNOWN_ORGANIZATIONAL_UNIT: 'Organizational unit was not found',
  MISSING_SERVICE: 'Service is required for this pack',
  UNKNOWN_SERVICE: 'Service was not found',
  UNKNOWN_USER: 'User was not found',
};

export function mapPolicyPackError(error: unknown): HttpException {
  if (!(error instanceof PolicyPackError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  return new BadRequestException(body);
}
