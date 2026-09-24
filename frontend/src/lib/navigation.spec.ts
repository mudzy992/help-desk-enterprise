import { describe, expect, it } from "vitest";
import {
  adminNavigationItem,
  configVersionsNavigationItem,
  getActiveNavigationItem,
  inboxNavigationItem,
  isNavigationItemActive,
  navigationLabelKeys,
  reportsNavigationItem,
  ticketsNavigationItem,
} from "@/lib/navigation";

describe("navigation IA matching", () => {
  it("activates inbox on /tickets?view=inbox and on bare /tickets", () => {
    expect(
      isNavigationItemActive(inboxNavigationItem, "/tickets", "?view=inbox"),
    ).toBe(true);
    expect(isNavigationItemActive(inboxNavigationItem, "/tickets", "")).toBe(
      true,
    );
    expect(
      isNavigationItemActive(ticketsNavigationItem, "/tickets", "?view=inbox"),
    ).toBe(false);
  });

  it("activates tickets on /tickets/:id and non-inbox list views", () => {
    expect(
      isNavigationItemActive(ticketsNavigationItem, "/tickets/abc", ""),
    ).toBe(true);
    expect(
      isNavigationItemActive(ticketsNavigationItem, "/tickets", "?view=all"),
    ).toBe(true);
    expect(
      isNavigationItemActive(inboxNavigationItem, "/tickets/abc", ""),
    ).toBe(false);
  });

  it("activates reports only on /reports", () => {
    expect(
      isNavigationItemActive(reportsNavigationItem, "/reports", ""),
    ).toBe(true);
    expect(isNavigationItemActive(reportsNavigationItem, "/", "")).toBe(false);
    expect(getActiveNavigationItem("/reports").labelKey).toBe(
      navigationLabelKeys.reports,
    );
  });

  it("does not activate tickets on /tickets/new", () => {
    expect(
      isNavigationItemActive(ticketsNavigationItem, "/tickets/new", ""),
    ).toBe(false);
    expect(
      getActiveNavigationItem("/tickets/new").labelKey,
    ).not.toBe(navigationLabelKeys.tickets);
  });

  it("activates admin only on /admin, not on admin subpages", () => {
    expect(isNavigationItemActive(adminNavigationItem, "/admin", "")).toBe(
      true,
    );
    expect(
      isNavigationItemActive(adminNavigationItem, "/admin", "?tab=users"),
    ).toBe(true);
    expect(
      isNavigationItemActive(adminNavigationItem, "/admin/config-versions", ""),
    ).toBe(false);
    expect(
      isNavigationItemActive(
        configVersionsNavigationItem,
        "/admin/config-versions",
        "",
      ),
    ).toBe(true);
    expect(getActiveNavigationItem("/admin").labelKey).toBe(
      navigationLabelKeys.admin,
    );
    expect(getActiveNavigationItem("/admin/config-versions").labelKey).toBe(
      navigationLabelKeys.configVersions,
    );
  });
});
