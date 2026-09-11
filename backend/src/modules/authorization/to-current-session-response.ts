import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import type { AuthorizationContext } from './authorization.types';
import type { CurrentSessionResponse } from './current-session.types';
import { allPermissionKeys } from './authorization.constants';

export function toCurrentSessionResponse(
  principal: AuthorizationPrincipal,
  context: AuthorizationContext | null,
): CurrentSessionResponse {
  const isSuperAdmin = context?.isSuperAdmin ?? false;
  return {
    principal: {
      subjectId: principal.subjectId,
      email: principal.email,
      displayName: principal.displayName,
      isLocalOnly: principal.isLocalOnly,
    },
    isSuperAdmin,
    roleKeys: sortedUnique(
      (context?.assignments ?? []).map((assignment) => assignment.roleKey),
    ),
    // SuperAdmin holds every permission, so the effective set is reported
    // directly instead of depending on seeded role-permission rows.
    permissionKeys: isSuperAdmin
      ? sortedUnique(allPermissionKeys)
      : sortedUnique(
          (context?.assignments ?? []).flatMap(
            (assignment) => assignment.permissionKeys,
          ),
        ),
  };
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
