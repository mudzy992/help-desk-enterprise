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
    error.code === 'SERVICE_NOT_FOUND'
  ) {
    throw new NotFoundException({
      code: error.code,
      message: 'Resource was not found',
    });
  }
  if (error.code === 'EMAIL_CONFLICT') {
    throw new ConflictException({
      code: error.code,
      message: 'A user with this email already exists',
    });
  }
  if (error.code === 'HAS_OPEN_TICKETS' || error.code === 'DELETE_RESTRICTED') {
    throw new ConflictException({
      code: error.code,
      message: 'User cannot be deleted while open tickets or relations remain',
    });
  }
  if (error.code === 'INVALID_INPUT') {
    throw new BadRequestException({
      code: error.code,
      message: 'User input is invalid',
    });
  }
  if (error.code === 'SUPER_ADMIN_GRANT_FORBIDDEN') {
    throw new ForbiddenException({
      code: error.code,
      message: 'Only SuperAdmin can assign the SuperAdmin role',
    });
  }
  throw new ForbiddenException({
    code: error.code,
    message: 'Authorization failed',
  });
}
