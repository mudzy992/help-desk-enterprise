import { authorizationDecisionReasons } from './authorization-decision-reason';
import { doesOrganizationalUnitScopeCover } from './does-organizational-unit-scope-cover';
import { doesServiceScopeCover } from './does-service-scope-cover';
import type {
  AuthorizationAccessDecision,
  AuthorizationAssignment,
  AuthorizationDecisionInput,
} from './authorization.types';

function hasInvalidRequirementTokens(
  tokens: readonly string[],
): boolean {
  return tokens.some((token) => token.trim().length === 0);
}

function deny(
  reason: AuthorizationAccessDecision['reason'],
): AuthorizationAccessDecision {
  return { allowed: false, reason };
}

function allow(
  reason: AuthorizationAccessDecision['reason'],
): AuthorizationAccessDecision {
  return { allowed: true, reason };
}

function doesAssignmentGrant(
  assignment: AuthorizationAssignment,
  input: AuthorizationDecisionInput,
): boolean {
  if (assignment.roleKey.trim().length === 0) {
    return false;
  }
  if (
    input.requiredRoles.length > 0 &&
    !input.requiredRoles.includes(assignment.roleKey)
  ) {
    return false;
  }
  if (input.requiredPermissions.length > 0) {
    const grantsPermission = input.requiredPermissions.some((permissionKey) =>
      assignment.permissionKeys.includes(permissionKey),
    );
    if (!grantsPermission) {
      return false;
    }
  }
  if (input.requireOrganizationalUnitScope) {
    if (
      !doesOrganizationalUnitScopeCover({
        assignedPath: assignment.organizationalUnitPath,
        requestedPath: input.organizationalUnitPath,
      })
    ) {
      return false;
    }
  } else if (
    input.requiredPermissions.length > 0 &&
    assignment.organizationalUnitId !== null
  ) {
    return false;
  }
  if (input.requireServiceScope) {
    if (
      !doesServiceScopeCover({
        assignedServiceId: assignment.serviceId,
        requestedServiceId: input.serviceId,
      })
    ) {
      return false;
    }
  } else if (
    input.requiredPermissions.length > 0 &&
    assignment.serviceId !== null
  ) {
    return false;
  }
  return true;
}

export function decideAuthorizationAccess(
  input: AuthorizationDecisionInput,
): AuthorizationAccessDecision {
  if (input.context === null || input.context.subjectId.trim().length === 0) {
    return deny(authorizationDecisionReasons.missingAuthorizationContext);
  }
  if (
    hasInvalidRequirementTokens(input.requiredRoles) ||
    hasInvalidRequirementTokens(input.requiredPermissions)
  ) {
    return deny(authorizationDecisionReasons.invalidRequirementTokens);
  }
  const hasRoleOrPermissionRequirement =
    input.requiredRoles.length > 0 || input.requiredPermissions.length > 0;
  if (!hasRoleOrPermissionRequirement && !input.requireOrganizationalUnitScope) {
    return deny(authorizationDecisionReasons.missingAuthorizationRequirement);
  }
  if (input.requireOrganizationalUnitScope) {
    if (
      input.organizationalUnitId === null ||
      input.organizationalUnitId.trim().length === 0 ||
      input.organizationalUnitPath === null ||
      input.organizationalUnitPath.trim().length === 0
    ) {
      return deny(authorizationDecisionReasons.missingOrganizationalUnitScope);
    }
  }
  if (input.requireServiceScope) {
    if (input.serviceId === null || input.serviceId.trim().length === 0) {
      return deny(authorizationDecisionReasons.missingServiceScope);
    }
  }
  if (input.context.isSuperAdmin) {
    if (!input.context.isLocalOnly) {
      return deny(authorizationDecisionReasons.superAdminNotLocalOnly);
    }
    return allow(authorizationDecisionReasons.superAdminAllowed);
  }
  const grants = input.context.assignments.some((assignment) =>
    doesAssignmentGrant(assignment, input),
  );
  return grants
    ? allow(authorizationDecisionReasons.assignmentAllowed)
    : deny(authorizationDecisionReasons.noMatchingAssignment);
}

export function evaluateAuthorizationAccess(
  input: AuthorizationDecisionInput,
): boolean {
  return decideAuthorizationAccess(input).allowed;
}
