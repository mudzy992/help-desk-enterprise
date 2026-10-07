import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  AUTHORIZATION_PERMISSION_MATCH_MODE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
} from './authorization.constants';

/** Requires any one listed permission (the backwards-compatible default). */
export const RequirePermissions = (...permissionKeys: readonly string[]) =>
  applyDecorators(
    SetMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, permissionKeys),
    SetMetadata(AUTHORIZATION_PERMISSION_MATCH_MODE_KEY, 'any'),
  );
