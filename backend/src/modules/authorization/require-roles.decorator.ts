import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_REQUIRED_ROLES_KEY } from './authorization.constants';

export const RequireRoles = (...roleKeys: readonly string[]) =>
  SetMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, roleKeys);
