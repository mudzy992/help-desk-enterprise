import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RbacError } from './rbac.error';

export function mapRbacError(error: unknown): never {
  if (!(error instanceof RbacError)) {
    throw error;
  }
  if (error.code === 'ROLE_NOT_FOUND') {
    throw new NotFoundException({
      code: error.code,
      message: 'Role was not found',
    });
  }
  if (error.code === 'INVALID_PERMISSION_KEY') {
    throw new NotFoundException({
      code: error.code,
      message: 'Permission key is not in the catalog',
    });
  }
  throw new ForbiddenException({
    code: error.code,
    message: 'Authorization failed',
  });
}
