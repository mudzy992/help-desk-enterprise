import { describe, expect, it } from "vitest";
import {
  inboxGroupTabsFromInboxTickets,
  ticketsForInboxTab,
  unroutedInboxTabKey,
  unroutedTicketsFromList,
} from "@/lib/tickets/inbox-view-tabs";
import type { TicketResponse } from "@/services/tickets-api";

function ticket(
  overrides: Partial<TicketResponse> & Pick<TicketResponse, "id">,
): TicketResponse {
  return {
    ticketNumber: `T-${overrides.id}`,
    title: "Inbox item",
    description: "",
    status: "PENDING",
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
    assignedGroupId: "group-a",
    assignedUserId: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("inbox-view-tabs", () => {
  it("never puts UNROUTED tickets on group tabs", () => {
    const leaked = ticket({
      id: "u1",
      status: "UNROUTED",
      assignedGroupId: null,
    });
    const pending = ticket({ id: "p1", assignedGroupId: "group-a" });
    expect(inboxGroupTabsFromInboxTickets([leaked, pending])).toEqual([
      { groupId: "group-a", count: 1 },
    ]);
    expect(ticketsForInboxTab("group-a", [leaked, pending], [leaked])).toEqual([
      pending,
    ]);
  });

  it("reads the unrouted tab only from listTickets status UNROUTED", () => {
    const unrouted = ticket({
      id: "u1",
      status: "UNROUTED",
      assignedGroupId: null,
    });
    const inbox = ticket({ id: "p1" });
    expect(
      ticketsForInboxTab(unroutedInboxTabKey, [inbox], [unrouted, inbox]).map(
        (item) => item.id,
      ),
    ).toEqual(["u1"]);
    expect(unroutedTicketsFromList([unrouted, inbox]).map((item) => item.id)).toEqual([
      "u1",
    ]);
  });
});
