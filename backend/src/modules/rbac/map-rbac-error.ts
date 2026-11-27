import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RbacError } from './rbac.error';

const PREVIEW_ERROR_MESSAGES = {
  PREVIEW_REQUIRED: 'Run the impact preview before saving role permissions',
  PREVIEW_STALE: 'The impact preview is stale — run it again before saving',
  PREVIEW_CONSUMED:
    'That impact preview was already used — run it again before saving',
} as const;

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
  if (
    error.code === 'PREVIEW_REQUIRED' ||
    error.code === 'PREVIEW_STALE' ||
    error.code === 'PREVIEW_CONSUMED'
  ) {
    throw new ConflictException({
      code: error.code,
      message: PREVIEW_ERROR_MESSAGES[error.code],
    });
  }
  throw new ForbiddenException({
    code: error.code,
    message: 'Authorization failed',
  });
}
