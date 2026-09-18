import { describe, expect, it } from "vitest";
import { roleKeys } from "@/lib/session/permission-keys";
import {
  roleRequiresOrganizationalUnitForTicketScope,
  shouldShowOrganizationalUnitWildcardInRoleAssignment,
  shouldWarnOrganizationalUnitMissingForRoleAssignment,
} from "@/lib/users/user-role-organizational-unit-scope";

describe("user role organizational unit scope", () => {
  it("requires a concrete OU for AGENT and ADMIN ticket scope", () => {
    expect(roleRequiresOrganizationalUnitForTicketScope(roleKeys.agent)).toBe(
      true,
    );
    expect(roleRequiresOrganizationalUnitForTicketScope(roleKeys.admin)).toBe(
      true,
    );
    expect(roleRequiresOrganizationalUnitForTicketScope(roleKeys.user)).toBe(
      false,
    );
    expect(
      roleRequiresOrganizationalUnitForTicketScope(roleKeys.superAdmin),
    ).toBe(false);
  });

  it("hides the OU wildcard option only for AGENT and ADMIN", () => {
    expect(
      shouldShowOrganizationalUnitWildcardInRoleAssignment(roleKeys.agent),
    ).toBe(false);
    expect(
      shouldShowOrganizationalUnitWildcardInRoleAssignment(roleKeys.admin),
    ).toBe(false);
    expect(
      shouldShowOrganizationalUnitWildcardInRoleAssignment(roleKeys.user),
    ).toBe(true);
    expect(
      shouldShowOrganizationalUnitWildcardInRoleAssignment(
        roleKeys.superAdmin,
      ),
    ).toBe(true);
  });

  it("warns when AGENT or ADMIN is assigned without an OU", () => {
    expect(
      shouldWarnOrganizationalUnitMissingForRoleAssignment(roleKeys.agent, ""),
    ).toBe(true);
    expect(
      shouldWarnOrganizationalUnitMissingForRoleAssignment(
        roleKeys.admin,
        "   ",
      ),
    ).toBe(true);
    expect(
      shouldWarnOrganizationalUnitMissingForRoleAssignment(
        roleKeys.agent,
        "ou-1",
      ),
    ).toBe(false);
    expect(
      shouldWarnOrganizationalUnitMissingForRoleAssignment(roleKeys.user, ""),
    ).toBe(false);
  });
});
