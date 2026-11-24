import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { GroupsError } from './groups.error';
import type { GroupsErrorCode } from './groups.error';

const notFoundCodes: readonly GroupsErrorCode[] = [
  'NOT_FOUND',
  'USER_NOT_FOUND',
  'ORGANIZATIONAL_UNIT_NOT_FOUND',
  'MEMBER_NOT_FOUND',
];

const conflictCodes: readonly GroupsErrorCode[] = [
  'DUPLICATE_KEY',
  'MEMBER_ALREADY_EXISTS',
  'HAS_DEPENDENCIES',
];

const messages: Record<GroupsErrorCode, string> = {
  NOT_FOUND: 'Group was not found',
  USER_NOT_FOUND: 'User was not found',
  ORGANIZATIONAL_UNIT_NOT_FOUND: 'Organizational unit was not found',
  INVALID_NAME: 'Group name is invalid',
  DUPLICATE_KEY: 'Group key already exists',
  MEMBER_ALREADY_EXISTS: 'User is already a member of this group',
  MEMBER_NOT_FOUND: 'User is not a member of this group',
  HAS_DEPENDENCIES:
    'Cannot delete a group that other records still depend on',
  FORBIDDEN: 'Authorization failed',
};

export function mapGroupsError(error: unknown): HttpException {
  if (!(error instanceof GroupsError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    ...(error.blockers.length > 0 ? { blockers: error.blockers } : {}),
  };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  if (error.code === 'FORBIDDEN') {
    return new ForbiddenException(body);
  }
  return new BadRequestException(body);
}
