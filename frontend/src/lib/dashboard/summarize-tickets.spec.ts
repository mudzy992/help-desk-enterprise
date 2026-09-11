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
});
