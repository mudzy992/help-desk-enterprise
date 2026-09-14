import { describe, expect, it } from "vitest";
import {
  getActiveNavigationItem,
  inboxNavigationItem,
  isNavigationItemActive,
  navigationLabelKeys,
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

  it("does not activate tickets on /tickets/new", () => {
    expect(
      isNavigationItemActive(ticketsNavigationItem, "/tickets/new", ""),
    ).toBe(false);
    expect(
      getActiveNavigationItem("/tickets/new").labelKey,
    ).not.toBe(navigationLabelKeys.tickets);
  });
});
