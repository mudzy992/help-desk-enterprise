import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_SERVICE_SCOPE_KEY } from './authorization.constants';
import type { AuthorizationScopeLocator } from './authorization.types';

export const RequireServiceScope = (
  locator: AuthorizationScopeLocator = { field: 'serviceId' },
) => SetMetadata(AUTHORIZATION_SERVICE_SCOPE_KEY, locator);
