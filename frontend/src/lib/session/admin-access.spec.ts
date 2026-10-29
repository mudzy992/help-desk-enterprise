import { describe, expect, it } from "vitest";
import { adminOpsVisibility, canWriteSettings } from "@/lib/session/admin-access";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

function capabilities(input: {
  readonly superAdmin?: boolean;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}): SessionCapabilities {
  const roles = input.roles ?? [];
  const permissions = input.permissions ?? [];
  return {
    session: {
      isSuperAdmin: input.superAdmin ?? false,
      roleKeys: roles,
      permissionKeys: permissions,
      organizationalUnitId: null,
      organizationalUnitName: null,
      principal: {
        subjectId: "admin-1",
        displayName: "Admin",
        email: "admin@example.com",
        isLocalOnly: false,
      },
    },
    isLoading: false,
    retry: () => undefined,
    hasRole: (role) => roles.includes(role),
    hasPermission: (permission) => permissions.includes(permission),
  };
}

describe("admin access predicates", () => {
  it("uses one settings-write predicate", () => {
    expect(canWriteSettings(capabilities({ roles: [roleKeys.admin] }))).toBe(false);
    expect(canWriteSettings(capabilities({ permissions: [permissionKeys.settingsWrite] }))).toBe(
      true,
    );
    expect(canWriteSettings(capabilities({ superAdmin: true }))).toBe(true);
  });

  it("keeps ops cards behind their specific permissions", () => {
    const visibility = adminOpsVisibility(
      capabilities({
        roles: [roleKeys.admin],
        permissions: [permissionKeys.opsHealthView, permissionKeys.auditExport],
      }),
    );
    expect(visibility).toEqual({
      health: true,
      manageAlerts: false,
      auditExport: true,
      supportBundle: false,
      securityMetrics: false,
      integrationQueue: false,
      teams: false,
    });
  });

  it("shows every ops surface to a super admin", () => {
    expect(Object.values(adminOpsVisibility(capabilities({ superAdmin: true })))).not.toContain(
      false,
    );
  });
});
