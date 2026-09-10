import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationalUnitError } from './organizational-unit.error';
import type { OrganizationalUnitErrorCode } from './organizational-unit.error';

const conflictCodes: readonly OrganizationalUnitErrorCode[] = [
  'DUPLICATE_DISTINGUISHED_NAME',
  'DUPLICATE_OU_PATH',
  'HAS_CHILDREN',
  'HAS_MAPPED_USERS',
];

const messages: Record<OrganizationalUnitErrorCode, string> = {
  NOT_FOUND: 'Organizational unit was not found',
  USER_NOT_FOUND: 'User was not found',
  INVALID_NAME: 'Organizational unit name is invalid',
  INVALID_DISTINGUISHED_NAME: 'Distinguished name is invalid',
  DISTINGUISHED_NAME_PARENT_MISMATCH:
    'Distinguished name must be a descendant of the parent distinguished name',
  INVALID_PARENT: 'Parent organizational unit was not found',
  SELF_PARENT: 'An organizational unit cannot be its own parent',
  CIRCULAR_HIERARCHY: 'The requested parent would create a circular hierarchy',
  DUPLICATE_DISTINGUISHED_NAME: 'Distinguished name already exists',
  DUPLICATE_OU_PATH: 'Organizational unit path already exists',
  HAS_CHILDREN: 'Organizational unit still has child units',
  HAS_MAPPED_USERS: 'Organizational unit still has mapped users',
};

export function mapOrganizationalUnitError(error: unknown): HttpException {
  if (!(error instanceof OrganizationalUnitError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === 'NOT_FOUND' || error.code === 'USER_NOT_FOUND') {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
