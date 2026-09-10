import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_REQUIRED_PERMISSIONS_KEY } from './authorization.constants';

export const RequirePermissions = (...permissionKeys: readonly string[]) =>
  SetMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, permissionKeys);
