import { describe, expect, it } from "vitest";
import {
  buildAdminPath,
  defaultAdminTab,
  isAdminTab,
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
});
