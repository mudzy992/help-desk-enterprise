import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readPrincipalContext } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

export type SlaReadScope = {
  readonly global: boolean;
  readonly organizationalUnitPaths: readonly string[];
  readonly serviceIds: readonly string[];
};

export function readSlaReadScope(request: AuthenticatedHttpRequest): SlaReadScope {
  const principal = readPrincipalContext(request);
  if (principal === null) return { global: false, organizationalUnitPaths: [], serviceIds: [] };
  if (principal.roleKeys.includes(authorizationRoleKeys.superAdmin)) {
    return { global: true, organizationalUnitPaths: [], serviceIds: [] };
  }
  const assignments = principal.assignments.filter((assignment) =>
    assignment.permissionKeys.includes(permissionKeys.slaRead) ||
    assignment.permissionKeys.includes(permissionKeys.slaWrite),
  );
  const global = assignments.some((assignment) =>
    assignment.organizationalUnitId === null && assignment.serviceId === null,
  );
  return {
    global,
    organizationalUnitPaths: [...new Set(assignments.map((assignment) => assignment.organizationalUnitPath).filter((value): value is string => value !== null))],
    serviceIds: [...new Set(assignments.map((assignment) => assignment.serviceId).filter((value): value is string => value !== null))],
  };
}

export function slaRuleScopeWhere(scope: SlaReadScope): object | undefined {
  if (scope.global) return undefined;
  return {
    OR: [
      { organizationalUnitId: null, serviceId: null },
      ...(scope.serviceIds.length === 0 ? [] : [{ serviceId: { in: [...scope.serviceIds] } }]),
      ...scope.organizationalUnitPaths.map((path) => ({ organizationalUnit: { ouPath: { startsWith: path } } })),
    ],
  };
}

export function slaProfileScopeWhere(scope: SlaReadScope): object | undefined {
  const ruleWhere = slaRuleScopeWhere(scope);
  return ruleWhere === undefined ? undefined : { rules: { some: ruleWhere } };
}
