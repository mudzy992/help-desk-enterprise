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
  // W2.36b: the SuperAdmin matrix is locked because runtime authority is the
  // full catalog — a real reason, which the caller must be able to read.
  SYSTEM_ROLE_PERMISSIONS_IMMUTABLE:
    'The SuperAdmin permission matrix is fixed by design: SuperAdmin always holds the full catalog at runtime, so there is nothing to grant or revoke',
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
    error.code === 'PREVIEW_CONSUMED' ||
    // W2.36b: refusing to edit the SuperAdmin matrix is a **conflict with the
    // role's design**, not an authorization failure. Reporting it as 403 made
    // the operator read "you are not allowed to manage role permissions" while
    // being the very account that is allowed to.
    error.code === 'SYSTEM_ROLE_PERMISSIONS_IMMUTABLE'
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
