import { applyDecorators, SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_PERMISSION_MATCH_MODE_KEY } from './authorization.constants';
import { RequirePermissions } from './require-permissions.decorator';

/**
 * Requires every listed permission on the same authorization assignment.
 * `@RequirePermissions` remains OR for backwards compatibility.
 */
export const RequireAllPermissions = (...permissionKeys: readonly string[]) =>
  applyDecorators(
    RequirePermissions(...permissionKeys),
    SetMetadata(AUTHORIZATION_PERMISSION_MATCH_MODE_KEY, 'all'),
  );
