import { roleKeys } from "@/lib/session/permission-keys";

const organizationalUnitTicketScopedRoleKeys: ReadonlySet<string> = new Set([
  roleKeys.agent,
  roleKeys.admin,
]);

export function roleRequiresOrganizationalUnitForTicketScope(
  roleKey: string,
): boolean {
  return organizationalUnitTicketScopedRoleKeys.has(roleKey);
}

export function shouldShowOrganizationalUnitWildcardInRoleAssignment(
  roleKey: string,
): boolean {
  return !roleRequiresOrganizationalUnitForTicketScope(roleKey);
}

export function shouldWarnOrganizationalUnitMissingForRoleAssignment(
  roleKey: string,
  organizationalUnitId: string,
): boolean {
  return (
    roleRequiresOrganizationalUnitForTicketScope(roleKey) &&
    organizationalUnitId.trim().length === 0
  );
}
