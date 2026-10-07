import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_AUDIT_PERMISSIONS_KEY } from './authorization.constants';

/**
 * Adds a permission enforced by a resource-filtering service to a SuperAdmin
 * bypass audit record without turning a collection endpoint into a global
 * permission check. The service must still enforce the permission per resource.
 */
export const AuditPermissions = (...permissionKeys: readonly string[]) =>
  SetMetadata(AUTHORIZATION_AUDIT_PERMISSIONS_KEY, permissionKeys);
