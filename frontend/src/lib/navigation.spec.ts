import { describe, expect, it } from "vitest";
import {
  adminNavigationItem,
  configVersionsNavigationItem,
  getActiveNavigationItem,
  isNavigationItemActive,
  navigationLabelKeys,
  navigationSections,
  reportsNavigationItem,
  ticketsNavigationItem,
} from "@/lib/navigation";

describe("navigation IA matching", () => {
  it("activates tickets on every list view and on ticket details", () => {
    expect(isNavigationItemActive(ticketsNavigationItem, "/tickets")).toBe(true);
    expect(isNavigationItemActive(ticketsNavigationItem, "/tickets/abc")).toBe(true);
  });

  it("does not list the group inbox as its own sidebar item", () => {
    const labels = navigationSections.flatMap((section) =>
      section.items.map((item) => item.labelKey as string),
    );
    expect(labels).not.toContain("navigation.inbox");
    expect(getActiveNavigationItem("/tickets").labelKey).toBe(navigationLabelKeys.tickets);
  });

  it("activates reports only on /reports", () => {
    expect(isNavigationItemActive(reportsNavigationItem, "/reports")).toBe(true);
    expect(isNavigationItemActive(reportsNavigationItem, "/")).toBe(false);
    expect(getActiveNavigationItem("/reports").labelKey).toBe(navigationLabelKeys.reports);
  });

  it("does not activate tickets on /tickets/new", () => {
    expect(isNavigationItemActive(ticketsNavigationItem, "/tickets/new")).toBe(false);
    expect(getActiveNavigationItem("/tickets/new").labelKey).not.toBe(navigationLabelKeys.tickets);
  });

  it("activates admin only on /admin, not on admin subpages", () => {
    expect(isNavigationItemActive(adminNavigationItem, "/admin")).toBe(true);
    expect(isNavigationItemActive(adminNavigationItem, "/admin/config-versions")).toBe(false);
    expect(isNavigationItemActive(configVersionsNavigationItem, "/admin/config-versions")).toBe(
      true,
    );
    expect(getActiveNavigationItem("/admin").labelKey).toBe(navigationLabelKeys.admin);
    expect(getActiveNavigationItem("/admin/config-versions").labelKey).toBe(
      navigationLabelKeys.configVersions,
    );
  });

  it("matches a path prefix only at a segment boundary", () => {
    expect(isNavigationItemActive(ticketsNavigationItem, "/ticketsx")).toBe(false);
  });
});
