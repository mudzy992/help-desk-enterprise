import type { PrincipalAssignment } from '../../common/principal-context/principal-context.types';
import {
  resolveCanonicalScope,
  type CanonicalAssignmentScope,
} from '../../common/principal-context/canonical-assignment';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';

export type AnnouncementOrganizationalUnitScope = {
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
};

export type AnnouncementPermissionScope = {
  /** Only an explicit global assignment or a valid local SuperAdmin is global. */
  readonly global: boolean;
  /** Service-only grants are deliberately not mapped to announcement audiences. */
  readonly organizationalUnits: readonly AnnouncementOrganizationalUnitScope[];
};

const emptyScope: AnnouncementPermissionScope = { global: false, organizationalUnits: [] };

function sameScope(left: CanonicalAssignmentScope, right: CanonicalAssignmentScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'global' || right.kind === 'global') return true;
  if (left.kind === 'service' || right.kind === 'service') {
    return left.kind === 'service' && right.kind === 'service' && left.serviceId === right.serviceId;
  }
  return left.organizationalUnitId === right.organizationalUnitId &&
    left.organizationalUnitPath === right.organizationalUnitPath;
}

function canonicalScope(assignment: PrincipalAssignment): CanonicalAssignmentScope | null {
  const resolved = resolveCanonicalScope(assignment);
  if (resolved === null || (assignment.scope !== undefined && !sameScope(resolved, assignment.scope))) return null;
  return resolved;
}

/**
 * Derive only the announcement scopes that can be safely applied to audiences:
 * global, or an OU subtree. A service assignment cannot bound the set of people
 * in an announcement audience, so it must not become global management/report
 * access (nor imply an OU scope).
 */
export function announcementPermissionScopeFromAssignments(input: {
  readonly assignments: readonly PrincipalAssignment[];
  readonly permissionKey: string;
  readonly isSuperAdmin: boolean;
  readonly isLocalOnly: boolean;
}): AnnouncementPermissionScope {
  if (input.isSuperAdmin) {
    return input.isLocalOnly ? { global: true, organizationalUnits: [] } : emptyScope;
  }

  let global = false;
  const organizationalUnits = new Map<string, AnnouncementOrganizationalUnitScope>();
  for (const assignment of input.assignments) {
    if (!assignment.permissionKeys.includes(input.permissionKey)) continue;
    const scope = canonicalScope(assignment);
    if (scope === null) continue;
    if (scope.kind === 'global') {
      global = true;
    } else if (scope.kind === 'organizational-unit') {
      organizationalUnits.set(scope.organizationalUnitId, {
        organizationalUnitId: scope.organizationalUnitId,
        organizationalUnitPath: scope.organizationalUnitPath,
      });
    }
  }
  return { global, organizationalUnits: [...organizationalUnits.values()] };
}

export function hasAnnouncementPermissionScope(scope: AnnouncementPermissionScope): boolean {
  return scope.global || scope.organizationalUnits.length > 0;
}

export function announcementUnitPathCoveredByScope(
  organizationalUnitPath: string | null,
  scope: AnnouncementPermissionScope,
): boolean {
  if (scope.global) return true;
  if (organizationalUnitPath === null || organizationalUnitPath.trim().length === 0) return false;
  return scope.organizationalUnits.some((assigned) =>
    doesOrganizationalUnitScopeCover({
      assignedPath: assigned.organizationalUnitPath,
      requestedPath: organizationalUnitPath,
    }),
  );
}

/** Every listed OU contributes to the audience; all must be within the grant. */
export function announcementAudienceUnitsCoveredByScope(
  organizationalUnitIds: readonly string[],
  unitPaths: ReadonlyMap<string, string>,
  scope: AnnouncementPermissionScope,
): boolean {
  if (scope.global) return true;
  const ids = [...new Set(organizationalUnitIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return false;
  return ids.every((id) => announcementUnitPathCoveredByScope(unitPaths.get(id) ?? null, scope));
}
