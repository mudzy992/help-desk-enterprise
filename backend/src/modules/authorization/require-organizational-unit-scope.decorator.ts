import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY } from './authorization.constants';
import type { AuthorizationScopeLocator } from './authorization.types';

export const RequireOrganizationalUnitScope = (
  locator: AuthorizationScopeLocator = { field: 'organizationalUnitId' },
) => SetMetadata(AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY, locator);
