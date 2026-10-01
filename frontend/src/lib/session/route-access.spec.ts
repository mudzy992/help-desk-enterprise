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
  canOpenAssets,
  canOpenProblems,
  canOpenEmailTemplatesPage,
  canOpenMyAssets,
  canAccessNavigationItem,
  canOpenAdminArea,
  canOpenReports,
  filterNavigationSections,
} from "@/lib/session/route-access";

function buildCapabilities(input: {
  readonly roleKeys?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly isSuperAdmin?: boolean;
  readonly cmdb?: boolean;
  readonly problems?: boolean;
}): SessionCapabilities {
  return {
    session: {
      isSuperAdmin: input.isSuperAdmin ?? false,
      roleKeys: input.roleKeys ?? [],
      permissionKeys: input.permissionKeys ?? [],
      organizationalUnitId: null,
      organizationalUnitName: null,
      modules: { cmdb: input.cmdb ?? false, problems: input.problems ?? false },
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
    const capabilities = buildCapabilities({ isSuperAdmin: true, cmdb: true, problems: true });
    const visible = filterNavigationSections(navigationSections, capabilities);
    expect(visible.flatMap((section) => section.items)).toHaveLength(
      navigationSections.flatMap((section) => section.items).length,
    );
  });
});

describe("canOpenAssets / canOpenMyAssets (paket 3.2)", () => {
  it("needs the module switched on", () => {
    expect(canOpenAssets(buildCapabilities({ isSuperAdmin: true }))).toBe(false);
    expect(canOpenMyAssets(buildCapabilities({ roleKeys: [roleKeys.user] }))).toBe(false);
  });

  it("opens the register for asset.read and my equipment for everyone", () => {
    expect(canOpenAssets(buildCapabilities({ cmdb: true, permissionKeys: [permissionKeys.assetRead] }))).toBe(true);
    expect(canOpenAssets(buildCapabilities({ cmdb: true, roleKeys: [roleKeys.user] }))).toBe(false);
    expect(canOpenMyAssets(buildCapabilities({ cmdb: true, roleKeys: [roleKeys.user] }))).toBe(true);
  });
});

describe("canOpenProblems (paket 3.3)", () => {
  it("needs the module and problem.read", () => {
    expect(canOpenProblems(buildCapabilities({ isSuperAdmin: true }))).toBe(false);
    expect(canOpenProblems(buildCapabilities({ problems: true, permissionKeys: [permissionKeys.problemRead] }))).toBe(true);
    expect(canOpenProblems(buildCapabilities({ problems: true, roleKeys: [roleKeys.user] }))).toBe(false);
  });
});

describe("canOpenEmailTemplatesPage", () => {
  it("allows admins and super admins, not agents", () => {
    expect(canOpenEmailTemplatesPage(buildCapabilities({ roleKeys: [roleKeys.admin] }))).toBe(true);
    expect(canOpenEmailTemplatesPage(buildCapabilities({ isSuperAdmin: true }))).toBe(true);
    expect(canOpenEmailTemplatesPage(buildCapabilities({ roleKeys: [roleKeys.agent] }))).toBe(false);
  });
});
