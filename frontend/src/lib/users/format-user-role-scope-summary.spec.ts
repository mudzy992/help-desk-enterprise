import { describe, expect, it } from "vitest";
import { formatUserRoleScopeSummary } from "@/lib/users/format-user-role-scope-summary";
import type { UserRoleResponse } from "@/services/users-api";

const baseRole = (
  overrides: Partial<UserRoleResponse>,
): UserRoleResponse => ({
  id: "role-1",
  roleKey: "AGENT",
  roleName: "Agent",
  organizationalUnitId: "ou-breza",
  organizationalUnitPath: "Breza",
  serviceId: null,
  serviceName: null,
  ...overrides,
});

describe("formatUserRoleScopeSummary", () => {
  it("formats ticket-scoped roles with OU label", () => {
    const actual = formatUserRoleScopeSummary([
      baseRole({ roleKey: "AGENT", roleName: "Agent" }),
    ]);
    expect(actual).toBe("Agent · OU=Breza");
  });

  it("falls back to role name when no ticket-scoped OU", () => {
    const actual = formatUserRoleScopeSummary([
      baseRole({
        roleKey: "USER",
        roleName: "User",
        organizationalUnitId: null,
        organizationalUnitPath: null,
      }),
    ]);
    expect(actual).toBe("User");
  });
});
