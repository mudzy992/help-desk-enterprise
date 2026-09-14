import { describe, expect, it } from "vitest";
import { countSidebarTicketBadges } from "@/lib/tickets/count-sidebar-ticket-badges";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

function ticket(
  id: string,
  status: TicketStatus,
): TicketResponse {
  return {
    id,
    ticketNumber: `T-${id}`,
    title: `Ticket ${id}`,
    description: "",
    status,
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "MEDIUM",
    classification: "INTERNAL",
    isConfidential: false,
    formData: null,
    originUnitId: "ou-1",
    serviceId: "svc-1",
    formVersionRef: "form-1",
    requesterId: "user-1",
    assignedGroupId: status === "UNROUTED" ? null : "group-1",
    assignedUserId: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
  };
}

describe("countSidebarTicketBadges", () => {
  it("counts open tickets and shows zero instead of hiding it", () => {
    expect(countSidebarTicketBadges([], [])).toEqual({
      openTicketCount: 0,
      inboxBadgeCount: 0,
      unroutedCount: 0,
    });
  });

  it("excludes closed, resolved, and archived tickets from the open count", () => {
    const counts = countSidebarTicketBadges(
      [
        ticket("1", "PENDING"),
        ticket("2", "WAITING_FOR_USER"),
        ticket("3", "PENDING_APPROVAL"),
        ticket("4", "UNROUTED"),
        ticket("5", "CLOSED"),
        ticket("6", "RESOLVED"),
        ticket("7", "ARCHIVED"),
      ],
      [ticket("8", "PENDING")],
    );
    expect(counts.openTicketCount).toBe(4);
    expect(counts.unroutedCount).toBe(1);
    expect(counts.inboxBadgeCount).toBe(2);
  });

  it("adds unrouted tickets from the list API onto the inbox length", () => {
    const counts = countSidebarTicketBadges(
      [ticket("1", "UNROUTED"), ticket("2", "ASSIGNED")],
      [ticket("3", "PENDING"), ticket("4", "PENDING")],
    );
    expect(counts.inboxBadgeCount).toBe(3);
    expect(counts.unroutedCount).toBe(1);
  });
});
