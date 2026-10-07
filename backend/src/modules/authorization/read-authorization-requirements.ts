import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_AUDIT_PERMISSIONS_KEY,
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
  AUTHORIZATION_PERMISSION_MATCH_MODE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  AUTHORIZATION_REQUIRED_ROLES_KEY,
  AUTHORIZATION_SERVICE_SCOPE_KEY,
} from './authorization.constants';
import type {
  AuthorizationRequirements,
  AuthorizationScopeLocator,
} from './authorization.types';

function readStringList(
  reflector: Reflector,
  metadataKey: string,
  context: ExecutionContext,
): readonly string[] {
  const value = reflector.getAllAndOverride<unknown>(metadataKey, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readScopeLocator(
  reflector: Reflector,
  metadataKey: string,
  context: ExecutionContext,
): AuthorizationScopeLocator | null {
  const value = reflector.getAllAndOverride<unknown>(metadataKey, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const locator = value as { field?: unknown; resource?: unknown };
  if (typeof locator.field !== 'string' || locator.field.trim().length === 0) {
    return null;
  }
  if (locator.resource !== undefined && locator.resource !== 'group') {
    return null;
  }
  return {
    field: locator.field.trim(),
    ...(locator.resource === 'group' ? { resource: 'group' as const } : {}),
  };
}

export function readAuthorizationRequirements(
  reflector: Reflector,
  context: ExecutionContext,
  options: { readonly requireOrganizationalUnitScope: boolean },
): AuthorizationRequirements {
  const organizationalUnitScope = readScopeLocator(
    reflector,
    AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
    context,
  );
  const serviceScope = readScopeLocator(
    reflector,
    AUTHORIZATION_SERVICE_SCOPE_KEY,
    context,
  );
  const requireOrganizationalUnitScope =
    options.requireOrganizationalUnitScope || organizationalUnitScope !== null;
  const matchMode = reflector.getAllAndOverride<unknown>(
    AUTHORIZATION_PERMISSION_MATCH_MODE_KEY,
    [context.getHandler(), context.getClass()],
  );
  return {
    requiredRoles: readStringList(
      reflector,
      AUTHORIZATION_REQUIRED_ROLES_KEY,
      context,
    ),
    requiredPermissions: readStringList(
      reflector,
      AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
      context,
    ),
    permissionMatchMode: matchMode === 'all' ? 'all' : 'any',
    auditPermissionKeys: readStringList(
      reflector,
      AUTHORIZATION_AUDIT_PERMISSIONS_KEY,
      context,
    ),
    organizationalUnitScope: requireOrganizationalUnitScope
      ? (organizationalUnitScope ?? { field: 'organizationalUnitId' })
      : null,
    serviceScope,
    requireOrganizationalUnitScope,
    requireServiceScope: serviceScope !== null,
  };
}
