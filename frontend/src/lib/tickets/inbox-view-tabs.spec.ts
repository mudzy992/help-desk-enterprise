import { describe, expect, it } from "vitest";
import {
  inboxGroupTabsFromMembership,
  ticketsForInboxTab,
  unroutedInboxTabKey,
  unroutedTicketsFromList,
} from "@/lib/tickets/inbox-view-tabs";
import type { MyGroupResponse } from "@/services/groups-api";
import type { TicketResponse } from "@/services/tickets-api";

function myGroup(overrides: Partial<MyGroupResponse> & Pick<MyGroupResponse, "id" | "name">): MyGroupResponse {
  return {
    organizationalUnit: { id: "ou-1", name: "OU", path: "/ou-1" },
    memberCount: 1,
    effectiveAutoAssign: "NONE",
    isFallback: false,
    ...overrides,
  };
}

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
    const groups = [myGroup({ id: "group-a", name: "Group A" })];
    expect(inboxGroupTabsFromMembership(groups, [leaked, pending])).toEqual([
      { groupId: "group-a", name: "Group A", count: 1 },
    ]);
    expect(ticketsForInboxTab("group-a", [leaked, pending], [leaked])).toEqual([
      pending,
    ]);
  });

  it("keeps a tab for a group with zero open tickets, sorted by name (INB-01)", () => {
    const groups = [
      myGroup({ id: "group-b", name: "Networking" }),
      myGroup({ id: "group-a", name: "Access management" }),
    ];
    const onlyGroupATicket = ticket({ id: "p1", assignedGroupId: "group-a" });
    expect(inboxGroupTabsFromMembership(groups, [onlyGroupATicket])).toEqual([
      { groupId: "group-a", name: "Access management", count: 1 },
      { groupId: "group-b", name: "Networking", count: 0 },
    ]);
  });

  it("ignores inbox tickets for groups the caller isn't a member of", () => {
    const foreignTicket = ticket({ id: "p1", assignedGroupId: "group-x" });
    expect(inboxGroupTabsFromMembership([], [foreignTicket])).toEqual([]);
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
