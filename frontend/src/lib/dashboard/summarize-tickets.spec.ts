import { describe, expect, it } from "vitest";
import { summarizeTickets } from "@/lib/dashboard/summarize-tickets";
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

describe("summarizeTickets", () => {
  it("derives operational counts from the tickets the API returned", () => {
    const summary = summarizeTickets(
      [
        ticket("1", "PENDING"),
        ticket("2", "IN_PROGRESS", { assignedUserId: "me" }),
        ticket("3", "WAITING_FOR_USER"),
        ticket("4", "PENDING_APPROVAL"),
        ticket("5", "UNROUTED"),
        ticket("6", "CLOSED", { requesterId: "me" }),
      ],
      "me",
    );
    expect(summary.total).toBe(6);
    expect(summary.open).toBe(3);
    expect(summary.waitingForUser).toBe(1);
    expect(summary.pendingApproval).toBe(1);
    expect(summary.unrouted).toBe(1);
    expect(summary.closed).toBe(1);
    expect(summary.assignedToMe).toBe(1);
    expect(summary.requestedByMe).toBe(1);
    expect(summary.critical).toBe(0);
    expect(summary.overdue).toBe(0);
  });

  it("counts critical, overdue, and tickets created today from real fields", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const todayMorning = new Date(2026, 8, 14, 8, 0, 0).toISOString();
    const yesterday = new Date(2026, 8, 13, 10, 0, 0).toISOString();
    const summary = summarizeTickets(
      [
        ticket("1", "PENDING", {
          priority: "CRITICAL",
          createdAt: todayMorning,
        }),
        ticket("2", "IN_PROGRESS", {
          priority: "CRITICAL",
          isOverdue: true,
          createdAt: yesterday,
        }),
        ticket("3", "CLOSED", {
          priority: "CRITICAL",
          isOverdue: true,
          createdAt: todayMorning,
        }),
        ticket("4", "ASSIGNED", {
          isOverdue: true,
          createdAt: todayMorning,
        }),
      ],
      null,
      now,
    );
    expect(summary.critical).toBe(2);
    expect(summary.overdue).toBe(3);
    expect(summary.openedToday).toBe(3);
    expect(summary.slaWatchlist.map((item) => item.id)).toEqual(["4", "3", "2"]);
    expect(summary.attention.map((item) => item.id)).toEqual(["2", "3", "4", "1"]);
  });

  it("excludes terminal tickets from the unassigned count", () => {
    const summary = summarizeTickets(
      [ticket("1", "PENDING"), ticket("2", "CLOSED"), ticket("3", "RESOLVED")],
      null,
    );
    expect(summary.unassigned).toBe(1);
    expect(summary.assignedToMe).toBe(0);
    expect(summary.requestedByMe).toBe(0);
  });

  it("orders recent tickets newest first", () => {
    const summary = summarizeTickets(
      [ticket("1", "PENDING"), ticket("3", "PENDING"), ticket("2", "PENDING")],
      null,
    );
    expect(summary.recent.map((item) => item.id)).toEqual(["3", "2", "1"]);
    expect(summary.statusCounts).toEqual([{ status: "PENDING", count: 3 }]);
  });

  it("buckets created and resolved tickets across the last 14 local days", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const summary = summarizeTickets(
      [
        ticket("1", "PENDING", {
          createdAt: new Date(2026, 8, 14, 8, 0, 0).toISOString(),
        }),
        ticket("2", "RESOLVED", {
          createdAt: new Date(2026, 8, 1, 9, 0, 0).toISOString(),
          resolvedAt: new Date(2026, 8, 13, 10, 0, 0).toISOString(),
        }),
        ticket("3", "CLOSED", {
          createdAt: new Date(2026, 7, 20, 9, 0, 0).toISOString(),
          closedAt: new Date(2026, 8, 14, 11, 0, 0).toISOString(),
        }),
        ticket("4", "RESOLVED", {
          createdAt: new Date(2026, 8, 10, 9, 0, 0).toISOString(),
        }),
      ],
      null,
      now,
    );
    expect(summary.volume14d).toHaveLength(14);
    expect(summary.volume14d[0]).toEqual({ d: "01. 09", created: 1, resolved: 0 });
    expect(summary.volume14d[12]).toEqual({ d: "13. 09", created: 0, resolved: 1 });
    expect(summary.volume14d[13]).toEqual({ d: "14. 09", created: 1, resolved: 1 });
    expect(summary.volume14d[9]).toEqual({ d: "10. 09", created: 1, resolved: 0 });
  });

  it("returns fourteen zero days when the ticket list is empty", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const summary = summarizeTickets([], null, now);
    expect(summary.total).toBe(0);
    expect(summary.statusCounts).toEqual([]);
    expect(summary.volume14d).toHaveLength(14);
    expect(summary.volume14d[0]?.d).toBe("01. 09");
    expect(summary.volume14d[13]?.d).toBe("14. 09");
    expect(
      summary.volume14d.every((day) => day.created === 0 && day.resolved === 0),
    ).toBe(true);
  });
});
