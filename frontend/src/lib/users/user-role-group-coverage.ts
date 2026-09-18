import { getGroup, listGroups } from "@/services/groups-api";
import type { UserRoleResponse } from "@/services/users-api";
import { roleRequiresOrganizationalUnitForTicketScope } from "@/lib/users/user-role-organizational-unit-scope";

export type UserRoleGroupCoverageGap = {
  readonly userRoleId: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitLabel: string;
};

export async function userIsMemberOfAnyGroupForOrganizationalUnit(
  userId: string,
  organizationalUnitId: string,
): Promise<boolean> {
  const groups = await listGroups(organizationalUnitId);
  if (groups.length === 0) {
    return false;
  }
  const loadedGroups = await Promise.all(groups.map((group) => getGroup(group.id)));
  return loadedGroups.some((group) =>
    group.members.some((member) => member.userId === userId),
  );
}

export async function findUserRoleGroupCoverageGaps(
  userId: string,
  roles: readonly UserRoleResponse[],
): Promise<readonly UserRoleGroupCoverageGap[]> {
  const scopedRoles = roles.filter(
    (role) =>
      roleRequiresOrganizationalUnitForTicketScope(role.roleKey) &&
      role.organizationalUnitId !== null &&
      role.organizationalUnitId.length > 0,
  );
  const gaps: UserRoleGroupCoverageGap[] = [];
  for (const role of scopedRoles) {
    const organizationalUnitId = role.organizationalUnitId as string;
    const hasMembership = await userIsMemberOfAnyGroupForOrganizationalUnit(
      userId,
      organizationalUnitId,
    );
    if (!hasMembership) {
      gaps.push({
        userRoleId: role.id,
        organizationalUnitId,
        organizationalUnitLabel:
          role.organizationalUnitPath ?? organizationalUnitId,
      });
    }
  }
  return gaps;
}
