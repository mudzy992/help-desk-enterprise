import type { AuthorizationAssignment } from './authorization.types';
import type { AuthorizationAccessEvaluation } from './evaluate-authorization-request';
import { shadowAuthorizationDecisions } from './shadow-authorization.types';
import type {
  ShadowAuthorizationAssignment,
  ShadowAuthorizationOrganizationalUnitScope,
  ShadowAuthorizationReport,
} from './shadow-authorization.types';

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedNullableStrings(
  values: readonly (string | null)[],
): readonly (string | null)[] {
  const present = uniqueSortedStrings(
    values.filter((value): value is string => value !== null),
  );
  return values.includes(null) ? [...present, null] : present;
}

function copyAssignment(
  assignment: AuthorizationAssignment,
): ShadowAuthorizationAssignment {
  return {
    roleKey: assignment.roleKey,
    permissionKeys: [...assignment.permissionKeys],
    organizationalUnitId: assignment.organizationalUnitId,
    organizationalUnitPath: assignment.organizationalUnitPath,
    serviceId: assignment.serviceId,
  };
}

function uniqueOrganizationalUnitScopes(
  assignments: readonly AuthorizationAssignment[],
): readonly ShadowAuthorizationOrganizationalUnitScope[] {
  const seen = new Set<string>();
  const scopes: ShadowAuthorizationOrganizationalUnitScope[] = [];
  for (const assignment of assignments) {
    const key = `${assignment.organizationalUnitId ?? ''}::${assignment.organizationalUnitPath ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    scopes.push({
      organizationalUnitId: assignment.organizationalUnitId,
      organizationalUnitPath: assignment.organizationalUnitPath,
    });
  }
  return scopes.sort((left, right) =>
    (left.organizationalUnitPath ?? '').localeCompare(
      right.organizationalUnitPath ?? '',
    ),
  );
}

export function createShadowAuthorizationReport(
  evaluation: AuthorizationAccessEvaluation,
): ShadowAuthorizationReport {
  const context = evaluation.decisionInput.context;
  const assignments = context?.assignments ?? [];
  return {
    kind: 'shadow',
    isEnforcing: false,
    decision: evaluation.allowed
      ? shadowAuthorizationDecisions.allow
      : shadowAuthorizationDecisions.deny,
    reason: evaluation.reason,
    requested: {
      permissionKeys: [...evaluation.decisionInput.requiredPermissions],
      roleKeys: [...evaluation.decisionInput.requiredRoles],
      organizationalUnitId: evaluation.decisionInput.organizationalUnitId,
      organizationalUnitPath: evaluation.decisionInput.organizationalUnitPath,
      serviceId: evaluation.decisionInput.serviceId,
      requireOrganizationalUnitScope:
        evaluation.decisionInput.requireOrganizationalUnitScope,
      requireServiceScope: evaluation.decisionInput.requireServiceScope,
    },
    considered: {
      subjectId: context?.subjectId ?? null,
      isSuperAdmin: context?.isSuperAdmin ?? false,
      isLocalOnly: context?.isLocalOnly ?? false,
      roleKeys: uniqueSortedStrings(assignments.map((assignment) => assignment.roleKey)),
      permissionKeys: uniqueSortedStrings(
        assignments.flatMap((assignment) => [...assignment.permissionKeys]),
      ),
      organizationalUnitScopes: uniqueOrganizationalUnitScopes(assignments),
      serviceIds: uniqueSortedNullableStrings(
        assignments.map((assignment) => assignment.serviceId),
      ),
      assignments: assignments.map(copyAssignment),
    },
  };
}
