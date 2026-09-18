import { describe, expect, it } from "vitest";
import {
  buildAdminGroupsPath,
  buildAdminPath,
  defaultAdminTab,
  isAdminTab,
  parseAdminGroupsOrganizationalUnitFilter,
  parseAdminTab,
} from "@/lib/admin/parse-admin-tab";

describe("parseAdminTab", () => {
  it("accepts known tabs and falls back to org", () => {
    expect(parseAdminTab("users")).toBe("users");
    expect(parseAdminTab("settings")).toBe("settings");
    expect(parseAdminTab("ops")).toBe("ops");
    expect(parseAdminTab("org")).toBe("org");
    expect(parseAdminTab(null)).toBe(defaultAdminTab);
    expect(parseAdminTab("unknown")).toBe(defaultAdminTab);
    expect(isAdminTab("queue")).toBe(false);
  });

  it("builds /admin?tab= and keeps other query params", () => {
    expect(buildAdminPath("users")).toBe("/admin?tab=users");
    expect(buildAdminPath("org", "?q=Ana")).toBe("/admin?q=Ana&tab=org");
  });

  it("builds groups admin path with optional organizational unit filter", () => {
    expect(buildAdminGroupsPath()).toBe("/admin?tab=groups");
    expect(buildAdminGroupsPath("ou-breza")).toBe(
      "/admin?tab=groups&ou=ou-breza",
    );
    expect(
      parseAdminGroupsOrganizationalUnitFilter(
        new URLSearchParams("tab=groups&ou=ou-breza"),
      ),
    ).toBe("ou-breza");
  });
});
