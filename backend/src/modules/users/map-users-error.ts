import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersError } from './users.error';

export function mapUsersError(error: unknown): never {
  if (!(error instanceof UsersError)) {
    throw error;
  }
  if (
    error.code === 'USER_NOT_FOUND' ||
    error.code === 'ROLE_NOT_FOUND' ||
    error.code === 'USER_ROLE_NOT_FOUND' ||
    error.code === 'ORGANIZATIONAL_UNIT_NOT_FOUND' ||
    error.code === 'SERVICE_NOT_FOUND' ||
    error.code === 'DIRECTORY_IDENTITY_NOT_FOUND'
  ) {
    throw new NotFoundException({
      code: error.code,
      message: 'Resource was not found',
    });
  }
  if (
    error.code === 'EMAIL_CONFLICT' ||
    error.code === 'DIRECTORY_IDENTITY_CONFLICT'
  ) {
    throw new ConflictException({
      code: error.code,
      message:
        error.code === 'DIRECTORY_IDENTITY_CONFLICT'
          ? 'Directory identity is already linked to another user'
          : 'A user with this email already exists',
    });
  }
  if (error.code === 'HAS_OPEN_TICKETS' || error.code === 'DELETE_RESTRICTED') {
    throw new ConflictException({
      code: error.code,
      message: 'User cannot be deleted while open tickets or relations remain',
    });
  }
  if (
    error.code === 'INVALID_INPUT' ||
    error.code === 'USER_ALREADY_DIRECTORY_LINKED'
  ) {
    throw new BadRequestException({
      code: error.code,
      message: 'User input is invalid',
    });
  }
  if (
    error.code === 'SUPER_ADMIN_GRANT_FORBIDDEN' ||
    error.code === 'SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN'
  ) {
    throw new ForbiddenException({
      code: error.code,
      message:
        error.code === 'SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN'
          ? 'SuperAdmin accounts cannot be linked to a directory identity'
          : 'Only SuperAdmin can assign the SuperAdmin role',
    });
  }
  throw new ForbiddenException({
    code: error.code,
    message: 'Authorization failed',
  });
}
