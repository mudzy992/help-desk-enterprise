import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  if (error.code === 'PREVIEW_REQUIRED' || error.code === 'PREVIEW_STALE') {
    throw new ConflictException({
      code: error.code,
      message:
        error.code === 'PREVIEW_STALE'
          ? 'The impact preview is stale — run it again before saving'
          : 'Run the impact preview before saving role permissions',
    });
  }
  throw new ForbiddenException({
    code: error.code,
    message: 'Authorization failed',
  });
}
