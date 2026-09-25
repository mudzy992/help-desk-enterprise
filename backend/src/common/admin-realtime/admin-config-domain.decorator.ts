import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import type { AdminConfigDomain } from './admin-config-realtime.types';
import { AdminConfigChangeInterceptor } from './admin-config-change.interceptor';

import { adminConfigDomainsMetadataKey } from './admin-config-domain.metadata';

/**
 * Package 1.7 (R2): after every successful mutating request (POST/PUT/PATCH/
 * DELETE) of the decorated controller or handler, admins get
 * `admin.config.updated { domain }` for each listed domain.
 */
export function AdminConfigDomains(...domains: AdminConfigDomain[]) {
  return applyDecorators(
    SetMetadata(adminConfigDomainsMetadataKey, domains),
    UseInterceptors(AdminConfigChangeInterceptor),
  );
}
