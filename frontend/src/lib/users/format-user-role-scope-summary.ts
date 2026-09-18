import type { UserRoleResponse } from "@/services/users-api";
import { roleRequiresOrganizationalUnitForTicketScope } from "@/lib/users/user-role-organizational-unit-scope";

export function formatUserRoleScopeSummary(
  roles: readonly UserRoleResponse[],
): string {
  const ticketScopedRoles = roles.filter(
    (role) =>
      roleRequiresOrganizationalUnitForTicketScope(role.roleKey) &&
      role.organizationalUnitPath !== null &&
      role.organizationalUnitPath.length > 0,
  );
  if (ticketScopedRoles.length > 0) {
    return ticketScopedRoles
      .map((role) => `${role.roleName} · OU=${role.organizationalUnitPath}`)
      .join(", ");
  }
  if (roles.length === 0) {
    return "";
  }
  const [firstRole] = roles;
  return firstRole.roleName;
}
