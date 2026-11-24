import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';

/**
 * W2.10 (`BA-users-01`): the users list has no resource id in the URL, so no
 * route decorator can scope it. Enumeration therefore follows the caller's
 * organizational units:
 *
 *   - a global grant (or a local SuperAdmin) sees the whole directory,
 *   - an OU-scoped grant sees the users of its subtree,
 *   - a service-scoped grant does **not** widen the list. A service scope says
 *     which service resources a role controls; it does not make the people who
 *     happen to hold a role on that service enumerable.
 *
 * A context that cannot be loaded yields an empty scope, never an unrestricted
 * one: a wiring fault must not turn into a full directory dump.
 */
export type UserListScope = {
  readonly unrestricted: boolean;
  /** `ouPath` prefixes; a user belongs to the scope when its unit matches one. */
  readonly organizationalUnitPaths: readonly string[];
};

const emptyScope: UserListScope = { unrestricted: false, organizationalUnitPaths: [] };

export function resolveUserListScope(
  context: AuthorizationContext | null | undefined,
  permissionKey: string = permissionKeys.userManage,
): UserListScope {
  if (context === null || context === undefined) {
    return emptyScope;
  }
  if (context.isSuperAdmin) {
    return context.isLocalOnly ? { unrestricted: true, organizationalUnitPaths: [] } : emptyScope;
  }
  const granted = context.assignments.filter((assignment) =>
    assignment.permissionKeys.includes(permissionKey),
  );
  if (
    granted.some(
      (assignment) =>
        assignment.organizationalUnitId === null &&
        assignment.organizationalUnitPath === null &&
        assignment.serviceId === null,
    )
  ) {
    return { unrestricted: true, organizationalUnitPaths: [] };
  }
  const paths = new Set<string>();
  for (const assignment of granted) {
    const path = assignment.organizationalUnitPath?.trim() ?? '';
    if (assignment.serviceId === null && path.length > 0) {
      paths.add(path);
    }
  }
  return { unrestricted: false, organizationalUnitPaths: [...paths].sort() };
}
