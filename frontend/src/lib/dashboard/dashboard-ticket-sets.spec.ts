import { describe, expect, it } from "vitest";
import {
  groupInboxCounts,
  recentTicketsExcluding,
  selectAttentionTickets,
  selectSlaWatchlist,
} from "@/lib/dashboard/dashboard-ticket-sets";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

function ticket(
  id: string,
  status: TicketStatus,
  overrides: Partial<TicketResponse> = {},
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
    assignedGroupId: "group-1",
    assignedUserId: null,
    createdAt: `2026-09-0${id}T10:00:00.000Z`,
    updatedAt: `2026-09-0${id}T10:00:00.000Z`,
    ...overrides,
  };
}

describe("selectSlaWatchlist", () => {
  it("keeps isOverdue semantics and caps at five newest updates", () => {
    const tickets = [
      ticket("1", "PENDING", { isOverdue: false }),
      ticket("2", "IN_PROGRESS", { isOverdue: true, updatedAt: "2026-09-02T10:00:00.000Z" }),
      ticket("3", "CLOSED", { isOverdue: true, updatedAt: "2026-09-04T10:00:00.000Z" }),
      ticket("4", "ASSIGNED", { updatedAt: "2026-09-05T10:00:00.000Z" }),
      ticket("5", "WAITING_FOR_USER", { isOverdue: true, updatedAt: "2026-09-01T10:00:00.000Z" }),
      ticket("6", "PENDING", { isOverdue: true, updatedAt: "2026-09-03T10:00:00.000Z" }),
      ticket("7", "PENDING", { isOverdue: true, updatedAt: "2026-09-06T10:00:00.000Z" }),
      ticket("8", "PENDING", { isOverdue: true, updatedAt: "2026-09-07T10:00:00.000Z" }),
    ];
    expect(selectSlaWatchlist(tickets).map((item) => item.id)).toEqual([
      "8",
      "7",
      "3",
      "6",
      "2",
    ]);
  });
});

describe("selectAttentionTickets", () => {
  it("unions overdue, open critical, and unrouted without duplicate rows", () => {
    const tickets = [
      ticket("1", "PENDING", { priority: "CRITICAL" }),
      ticket("2", "IN_PROGRESS", { isOverdue: true, priority: "CRITICAL" }),
      ticket("3", "UNROUTED"),
      ticket("4", "CLOSED", { priority: "CRITICAL" }),
      ticket("5", "UNROUTED", { isOverdue: true }),
    ];
    expect(selectAttentionTickets(tickets).map((item) => item.id)).toEqual([
      "2",
      "5",
      "1",
      "3",
    ]);
  });
});

describe("recentTicketsExcluding", () => {
  it("drops recent rows that already appear in the attention set", () => {
    const recent = [ticket("1", "PENDING"), ticket("2", "PENDING")];
    const attention = [ticket("2", "UNROUTED")];
    expect(recentTicketsExcluding(recent, attention).map((item) => item.id)).toEqual([
      "1",
    ]);
  });
});

describe("groupInboxCounts", () => {
  it("counts inbox tickets by assigned group id without inventing names", () => {
    const counts = groupInboxCounts([
      ticket("1", "ASSIGNED", { assignedGroupId: "aaaaaaaa-1111-group" }),
      ticket("2", "ASSIGNED", { assignedGroupId: "aaaaaaaa-1111-group" }),
      ticket("3", "ASSIGNED", { assignedGroupId: null }),
      ticket("4", "ASSIGNED", { assignedGroupId: "bbbbbbbb-2222-group" }),
    ]);
    expect(counts).toEqual([
      { groupId: "aaaaaaaa-1111-group", label: "aaaaaaaa…", count: 2 },
      { groupId: "bbbbbbbb-2222-group", label: "bbbbbbbb…", count: 1 },
      { groupId: null, label: "", count: 1 },
    ]);
  });
});
