import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
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
  const field = (value as { field?: unknown }).field;
  if (typeof field !== 'string' || field.trim().length === 0) {
    return null;
  }
  return { field: field.trim() };
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
    organizationalUnitScope: requireOrganizationalUnitScope
      ? (organizationalUnitScope ?? { field: 'organizationalUnitId' })
      : null,
    serviceScope,
    requireOrganizationalUnitScope,
    requireServiceScope: serviceScope !== null,
  };
}
