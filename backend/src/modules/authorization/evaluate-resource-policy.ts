import { doesOrganizationalUnitScopeCover } from './does-organizational-unit-scope-cover';
import type { AuthorizationAssignment, AuthorizationContext } from './authorization.types';

export type ResourcePolicyTarget = {
  readonly ownerUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
};

export type ResourcePolicyInput = {
  readonly context: AuthorizationContext | null;
  readonly permissionKey: string;
  readonly target: ResourcePolicyTarget;
  /** Ownership is never inferred: a caller must explicitly opt into it. */
  readonly allowOwner: boolean;
};

export type ResourcePolicyDecision = {
  readonly allowed: boolean;
  readonly reason:
    | 'MISSING_CONTEXT'
    | 'INVALID_INPUT'
    | 'SUPER_ADMIN_ALLOWED'
    | 'OWNER_ALLOWED'
    | 'GLOBAL_ASSIGNMENT_ALLOWED'
    | 'OU_ASSIGNMENT_ALLOWED'
    | 'SERVICE_ASSIGNMENT_ALLOWED'
    | 'NO_MATCHING_PERMISSION_SCOPE';
};

const decision = (allowed: boolean, reason: ResourcePolicyDecision['reason']): ResourcePolicyDecision => ({ allowed, reason });

function grantsPermission(assignment: AuthorizationAssignment, permissionKey: string): boolean {
  // roleKey is deliberately irrelevant: permissions, canonical scope and an
  // explicit ownership rule are the only non-SuperAdmin authorization inputs.
  return assignment.permissionKeys.includes(permissionKey);
}

export function evaluateResourcePolicy(input: ResourcePolicyInput): ResourcePolicyDecision {
  const permissionKey = input.permissionKey.trim();
  if (input.context === null) return decision(false, 'MISSING_CONTEXT');
  const target = input.target;
  const hasOuId = Boolean(target.organizationalUnitId?.trim());
  const hasOuPath = Boolean(target.organizationalUnitPath?.trim());
  const hasService = Boolean(target.serviceId?.trim());
  if (
    permissionKey.length === 0 ||
    hasOuId !== hasOuPath ||
    (hasService && (hasOuId || hasOuPath))
  ) return decision(false, 'INVALID_INPUT');
  if (input.context.isSuperAdmin) {
    return input.context.isLocalOnly
      ? decision(true, 'SUPER_ADMIN_ALLOWED')
      : decision(false, 'NO_MATCHING_PERMISSION_SCOPE');
  }
  const matching = input.context.assignments.filter((assignment) => grantsPermission(assignment, permissionKey));
  if (
    input.allowOwner &&
    target.ownerUserId?.trim() === input.context.subjectId &&
    matching.length > 0
  ) return decision(true, 'OWNER_ALLOWED');
  if (matching.some((assignment) => assignment.organizationalUnitId === null && assignment.organizationalUnitPath === null && assignment.serviceId === null)) {
    return decision(true, 'GLOBAL_ASSIGNMENT_ALLOWED');
  }
  if (hasOuPath && matching.some((assignment) =>
    assignment.serviceId === null &&
    doesOrganizationalUnitScopeCover({
      assignedPath: assignment.organizationalUnitPath,
      requestedPath: target.organizationalUnitPath,
    }),
  )) return decision(true, 'OU_ASSIGNMENT_ALLOWED');
  if (hasService && matching.some((assignment) =>
    assignment.organizationalUnitId === null &&
    assignment.organizationalUnitPath === null &&
    assignment.serviceId === target.serviceId,
  )) return decision(true, 'SERVICE_ASSIGNMENT_ALLOWED');
  return decision(false, 'NO_MATCHING_PERMISSION_SCOPE');
}
