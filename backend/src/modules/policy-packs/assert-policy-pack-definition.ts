import {
  allPermissionKeys,
  authorizationRoleKeys,
  defaultRolePermissionKeys,
} from '../authorization/authorization.constants';
import { policyPackGrantScopes } from './policy-pack.constants';
import { PolicyPackError } from './policy-pack.error';
import type {
  PolicyPackDefinition,
  PolicyPackGrantDefinition,
} from './policy-pack.types';

const assignableRoleKeys = new Set<string>([
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
]);

const catalogPermissionKeys = new Set<string>(allPermissionKeys);

function grantIdentity(grant: PolicyPackGrantDefinition): string {
  return [
    grant.roleKey,
    grant.organizationalUnitScope,
    grant.serviceScope,
  ].join(':');
}

export function assertPolicyPackDefinition(
  pack: PolicyPackDefinition,
): void {
  if (pack.key.trim().length === 0 || pack.grants.length === 0) {
    throw new PolicyPackError('INVALID_PACK_DEFINITION');
  }
  const seenGrants = new Set<string>();
  for (const grant of pack.grants) {
    if (grant.roleKey === authorizationRoleKeys.superAdmin) {
      throw new PolicyPackError('SUPER_ADMIN_GRANT_FORBIDDEN');
    }
    if (!assignableRoleKeys.has(grant.roleKey)) {
      throw new PolicyPackError('UNKNOWN_ROLE');
    }
    if (
      grant.organizationalUnitScope !== policyPackGrantScopes.none &&
      grant.organizationalUnitScope !== policyPackGrantScopes.target
    ) {
      throw new PolicyPackError('INVALID_PACK_DEFINITION');
    }
    if (
      grant.serviceScope !== policyPackGrantScopes.none &&
      grant.serviceScope !== policyPackGrantScopes.target
    ) {
      throw new PolicyPackError('INVALID_PACK_DEFINITION');
    }
    const identity = grantIdentity(grant);
    if (seenGrants.has(identity)) {
      throw new PolicyPackError('INVALID_PACK_DEFINITION');
    }
    seenGrants.add(identity);
    const allowedForRole = new Set(
      defaultRolePermissionKeys[grant.roleKey] ?? [],
    );
    for (const permissionKey of grant.permissionKeys) {
      if (!catalogPermissionKeys.has(permissionKey)) {
        throw new PolicyPackError('UNKNOWN_PERMISSION');
      }
      if (!allowedForRole.has(permissionKey)) {
        throw new PolicyPackError('PERMISSION_NOT_ALLOWED_FOR_ROLE');
      }
    }
  }
}
