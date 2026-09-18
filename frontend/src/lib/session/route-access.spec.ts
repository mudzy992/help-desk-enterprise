import { describe, expect, it } from "vitest";
import {
  adminNavigationItem,
  configVersionsNavigationItem,
  dashboardNavigationItem,
  navigationSections,
  reportsNavigationItem,
} from "@/lib/navigation";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  canAccessNavigationItem,
  canOpenAdminArea,
  canOpenReports,
  filterNavigationSections,
} from "@/lib/session/route-access";

function buildCapabilities(input: {
  readonly roleKeys?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly isSuperAdmin?: boolean;
}): SessionCapabilities {
  return {
    session: {
      isSuperAdmin: input.isSuperAdmin ?? false,
      roleKeys: input.roleKeys ?? [],
      permissionKeys: input.permissionKeys ?? [],
      organizationalUnitId: null,
      organizationalUnitName: null,
      principal: {
        subjectId: "user-1",
        displayName: "Test User",
        email: "test@example.com",
        isLocalOnly: false,
      },
    },
    isLoading: false,
    hasPermission: (permission) =>
      (input.permissionKeys ?? []).includes(permission),
    hasRole: (role) => (input.roleKeys ?? []).includes(role),
  };
}

describe("route access", () => {
  it("allows agents into dashboard but not admin navigation", () => {
    const capabilities = buildCapabilities({ roleKeys: [roleKeys.agent] });
    expect(canAccessNavigationItem(dashboardNavigationItem, capabilities)).toBe(true);
    expect(canAccessNavigationItem(adminNavigationItem, capabilities)).toBe(false);
    expect(canOpenAdminArea(capabilities)).toBe(false);
  });

  it("allows admins into reports when export permissions exist", () => {
    const capabilities = buildCapabilities({
      roleKeys: [roleKeys.admin],
      permissionKeys: [permissionKeys.reportsExport],
    });
    expect(canOpenReports(capabilities)).toBe(true);
    expect(canAccessNavigationItem(reportsNavigationItem, capabilities)).toBe(true);
  });

  it("hides admin-only sections for agents in sidebar filtering", () => {
    const capabilities = buildCapabilities({ roleKeys: [roleKeys.agent] });
    const visible = filterNavigationSections(navigationSections, capabilities);
    const labels = visible.flatMap((section) => section.items.map((item) => item.path));
    expect(labels).toContain("/");
    expect(labels).not.toContain("/admin");
    expect(labels).not.toContain("/admin/config-versions");
    expect(canAccessNavigationItem(configVersionsNavigationItem, capabilities)).toBe(
      false,
    );
  });

  it("allows superadmin into all navigation entries", () => {
    const capabilities = buildCapabilities({ isSuperAdmin: true });
    const visible = filterNavigationSections(navigationSections, capabilities);
    expect(visible.flatMap((section) => section.items)).toHaveLength(
      navigationSections.flatMap((section) => section.items).length,
    );
  });
});
