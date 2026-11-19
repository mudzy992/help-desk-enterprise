import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { isNonEmptyScopeValue } from '../authorization/does-organizational-unit-scope-cover';
import { selectOrganizationalUnitIdsInScope } from '../audit-log/select-organizational-unit-ids-in-scope';

/**
 * W7.55 (BA-search-01): the directory policy of `GET /search?types=user`.
 *
 * Before this file the people group was answered to any caller holding the
 * `ADMIN` role name, and the read itself had no organizational-unit predicate —
 * a scoped administrator could therefore discover users of every unit. The
 * policy is now named, explicit and scoped:
 *
 * 1. the grant is a permission (`user.directory.read`), not a role name;
 * 2. reach is the union of the organizational-unit subtrees of the assignments
 *    that carry the grant — a global search is only open to `SUPER_ADMIN` or to
 *    an assignment that is deliberately unscoped;
 * 3. the response is privacy-minimal: e-mail addresses are returned only when
 *    the reach is global, because the directory discovery surface does not need
 *    them while the unit list (`GET /organizational-units/:id/users`) remains
 *    the screen that shows the record in full;
 * 4. every unresolvable case fails closed to an empty group (the caller still
 *    gets the ticket and article groups).
 */
export const directorySearchPermissionKey = permissionKeys.userDirectoryRead;

/**
 * Assessed grant, before organizational units are known. Kept separate from the
 * scope so the (cheap, pure) decision can be unit-tested without a database and
 * so the service reads the unit table only when a scoped grant needs it.
 */
export type DirectorySearchGrant =
  | { readonly kind: 'none' }
  | { readonly kind: 'everyone'; readonly includeEmail: boolean }
  | {
      readonly kind: 'organizationalUnits';
      readonly organizationalUnitPaths: readonly string[];
    };

/** Grant resolved against the unit tree: what the query may read. */
export type DirectorySearchScope =
  | { readonly kind: 'none' }
  | { readonly kind: 'everyone'; readonly includeEmail: boolean }
  | {
      readonly kind: 'organizationalUnits';
      readonly organizationalUnitIds: readonly string[];
    };

export function resolveDirectorySearchGrant(
  authorization: AuthorizationContext,
): DirectorySearchGrant {
  if (authorization.isSuperAdmin) {
    return { kind: 'everyone', includeEmail: true };
  }
  const granting = authorization.assignments.filter(isDirectoryGranting);
  if (granting.length === 0) {
    return { kind: 'none' };
  }
  // Global reach needs an explicit, unscoped `user.directory.read` grant. The
  // legacy `ADMIN` role name still answers the group, but it never widens the
  // scope beyond the units it is assigned to; an unscoped legacy ADMIN keeps
  // the pre-W7.55 global reach without the e-mail column.
  if (granting.some(isExplicitlyUnscoped)) {
    return { kind: 'everyone', includeEmail: true };
  }
  if (granting.some(isUnscoped)) {
    return { kind: 'everyone', includeEmail: false };
  }
  const paths = [
    ...new Set(
      granting
        .map((assignment) => assignment.organizationalUnitPath)
        .filter(isNonEmptyScopeValue)
        .map((path) => path.trim()),
    ),
  ];
  if (paths.length === 0) {
    // Assignments that name a unit without a path (or a service only) cannot be
    // resolved into a subtree: reading nothing is the only safe answer.
    return { kind: 'none' };
  }
  return { kind: 'organizationalUnits', organizationalUnitPaths: paths };
}

export function resolveDirectorySearchScope(input: {
  readonly grant: DirectorySearchGrant;
  readonly organizationalUnits: readonly {
    readonly id: string;
    readonly ouPath: string;
  }[];
}): DirectorySearchScope {
  if (input.grant.kind !== 'organizationalUnits') {
    return input.grant;
  }
  const ids = [
    ...new Set(
      input.grant.organizationalUnitPaths.flatMap((path) =>
        selectOrganizationalUnitIdsInScope(input.organizationalUnits, path),
      ),
    ),
  ].sort();
  if (ids.length === 0) {
    return { kind: 'none' };
  }
  return { kind: 'organizationalUnits', organizationalUnitIds: ids };
}

function isDirectoryGranting(assignment: {
  readonly roleKey: string;
  readonly permissionKeys: readonly string[];
}): boolean {
  return (
    assignment.permissionKeys.includes(directorySearchPermissionKey) ||
    assignment.roleKey === authorizationRoleKeys.admin
  );
}

function isExplicitlyUnscoped(assignment: {
  readonly permissionKeys: readonly string[];
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
}): boolean {
  return (
    assignment.permissionKeys.includes(directorySearchPermissionKey) &&
    isUnscoped(assignment)
  );
}

/** Unscoped means "no OU and no service": a service-scoped grant is not global. */
function isUnscoped(assignment: {
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
}): boolean {
  return (
    assignment.organizationalUnitId === null &&
    assignment.organizationalUnitPath === null &&
    assignment.serviceId === null
  );
}
