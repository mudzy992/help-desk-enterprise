import type {
  AuthorizationAssignment,
  AuthorizationContext,
  AuthorizationDecisionInput,
} from './authorization.types';
import { authorizationRoleKeys, permissionKeys } from './authorization.constants';

export function createTestAssignment(
  overrides: Partial<AuthorizationAssignment> = {},
): AuthorizationAssignment {
  return {
    roleKey: authorizationRoleKeys.agent,
    permissionKeys: [permissionKeys.ticketMerge],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    ...overrides,
  };
}

export function createTestAuthorizationContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  return {
    subjectId: 'user-1',
    isLocalOnly: false,
    isSuperAdmin: false,
    assignments: [createTestAssignment()],
    ...overrides,
  };
}

export function createTestDecisionInput(
  overrides: Partial<AuthorizationDecisionInput> = {},
): AuthorizationDecisionInput {
  return {
    context: createTestAuthorizationContext(),
    requiredRoles: [],
    requiredPermissions: [permissionKeys.ticketMerge],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    requireOrganizationalUnitScope: false,
    requireServiceScope: false,
    ...overrides,
  };
}
