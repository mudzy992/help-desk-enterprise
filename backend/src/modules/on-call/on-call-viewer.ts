import type { PrincipalAssignment, PrincipalContext } from '../../common/principal-context/principal-context.types';
import { resolveCanonicalScope } from '../../common/principal-context/canonical-assignment';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

export type OnCallGroupScope = {
  /** An unscoped on-call grant applies to every group. */
  readonly global: boolean;
  /** OU grants include the assigned unit and its descendants. */
  readonly organizationalUnitPaths: readonly string[];
};

export type OnCallViewer = {
  readonly userId: string;
  readonly canRead: boolean;
  readonly canManage: boolean;
  /** Read grants and manage grants (a manager can also read that group). */
  readonly readScope: OnCallGroupScope;
  /** Only oncall.manage grants; read grants never authorize writes. */
  readonly manageScope: OnCallGroupScope;
};

const emptyScope: OnCallGroupScope = { global: false, organizationalUnitPaths: [] };
const globalScope: OnCallGroupScope = { global: true, organizationalUnitPaths: [] };

type OnCallPermission = typeof permissionKeys.onCallRead | typeof permissionKeys.onCallManage;

function hasPermission(assignment: PrincipalAssignment, permission: OnCallPermission): boolean {
  return assignment.permissionKeys.includes(permission);
}

function sameScope(
  left: NonNullable<PrincipalAssignment['scope']>,
  right: NonNullable<PrincipalAssignment['scope']>,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'global' || right.kind === 'global') return true;
  if (left.kind === 'service' || right.kind === 'service') {
    return left.kind === 'service' && right.kind === 'service' && left.serviceId === right.serviceId;
  }
  return left.organizationalUnitId === right.organizationalUnitId &&
    left.organizationalUnitPath === right.organizationalUnitPath;
}

function canonicalAssignmentScope(assignment: PrincipalAssignment): NonNullable<PrincipalAssignment['scope']> | null {
  const resolved = resolveCanonicalScope(assignment);
  if (resolved === null || (assignment.scope !== undefined && !sameScope(resolved, assignment.scope))) return null;
  return resolved;
}

function scopeFromAssignments(assignments: readonly PrincipalAssignment[]): OnCallGroupScope {
  let global = false;
  const organizationalUnitPaths = new Set<string>();
  for (const assignment of assignments) {
    const scope = canonicalAssignmentScope(assignment);
    if (scope === null) continue;
    if (scope.kind === 'global') {
      global = true;
    } else if (scope.kind === 'organizational-unit') {
      organizationalUnitPaths.add(scope.organizationalUnitPath);
    }
    // Service assignments do not map to groups: Group has no service relation,
    // so a service-only grant deliberately receives no group access.
  }
  return { global, organizationalUnitPaths: [...organizationalUnitPaths] };
}

export function onCallViewerFromContext(context: PrincipalContext | null, userId: string): OnCallViewer {
  if (context === null) {
    return { userId, canRead: false, canManage: false, readScope: emptyScope, manageScope: emptyScope };
  }
  const roles = new Set([...context.roleKeys, ...context.assignments.map((assignment) => assignment.roleKey)]);
  const isSuperAdmin = roles.has(authorizationRoleKeys.superAdmin);
  if (isSuperAdmin) {
    return { userId, canRead: true, canManage: true, readScope: globalScope, manageScope: globalScope };
  }

  const readAssignments = context.assignments.filter((assignment) =>
    hasPermission(assignment, permissionKeys.onCallRead) || hasPermission(assignment, permissionKeys.onCallManage),
  );
  const manageAssignments = context.assignments.filter((assignment) =>
    hasPermission(assignment, permissionKeys.onCallManage),
  );
  return {
    userId,
    canRead: readAssignments.length > 0,
    canManage: manageAssignments.length > 0,
    readScope: scopeFromAssignments(readAssignments),
    manageScope: scopeFromAssignments(manageAssignments),
  };
}

function scopeCoversGroup(scope: OnCallGroupScope, organizationalUnitPath: string | null): boolean {
  const requestedPath = organizationalUnitPath?.trim() || null;
  if (requestedPath === null) return false;
  if (scope.global) return true;
  return scope.organizationalUnitPaths.some((assignedPath) =>
    doesOrganizationalUnitScopeCover({ assignedPath, requestedPath }),
  );
}

export function canReadOnCallGroup(viewer: OnCallViewer, organizationalUnitPath: string | null): boolean {
  return viewer.canRead && scopeCoversGroup(viewer.readScope, organizationalUnitPath);
}

export function canManageOnCallGroup(viewer: OnCallViewer, organizationalUnitPath: string | null): boolean {
  return viewer.canManage && scopeCoversGroup(viewer.manageScope, organizationalUnitPath);
}

export function onCallViewerOf(request: AuthenticatedHttpRequest, userId: string): OnCallViewer {
  return onCallViewerFromContext(readPrincipalContext(request), userId);
}
