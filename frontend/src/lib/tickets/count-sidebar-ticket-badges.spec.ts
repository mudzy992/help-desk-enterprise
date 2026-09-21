import { describe, expect, it } from "vitest";
import { toSidebarTicketCounts } from "@/lib/tickets/count-sidebar-ticket-badges";

describe("toSidebarTicketCounts", () => {
  it("shows zero instead of hiding it", () => {
    expect(
      toSidebarTicketCounts({ open: 0, unrouted: 0, inbox: 0 }, true),
    ).toEqual({ openTicketCount: 0, inboxBadgeCount: 0, unroutedCount: 0 });
  });

  it("adds unrouted tickets onto the inbox size for staff", () => {
    expect(
      toSidebarTicketCounts({ open: 4, unrouted: 1, inbox: 2 }, true),
    ).toEqual({ openTicketCount: 4, inboxBadgeCount: 3, unroutedCount: 1 });
  });

  it("ignores the inbox size for people who have no group inbox", () => {
    expect(
      toSidebarTicketCounts({ open: 4, unrouted: 1, inbox: 2 }, false),
    ).toEqual({ openTicketCount: 4, inboxBadgeCount: 1, unroutedCount: 1 });
  });
});
