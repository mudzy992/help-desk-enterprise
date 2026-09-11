import { describe, expect, it } from "vitest";
import { canShowClaimAction, canShowReopenAction, nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import type { TicketResponse } from "@/services/tickets-api";

const base: TicketResponse = {
  id: "t1",
  ticketNumber: "T-000001",
  title: "VPN",
  description: "down",
  status: "PENDING",
  priority: "HIGH",
  impact: "HIGH",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("ticket actions", () => {
  it("shows claim only for unassigned claimable work", () => {
    expect(canShowClaimAction(base)).toBe(true);
    expect(canShowClaimAction({ ...base, assignedUserId: "agent-1" })).toBe(false);
    expect(canShowClaimAction({ ...base, assignedGroupId: null })).toBe(false);
    expect(canShowClaimAction({ ...base, status: "RESOLVED" })).toBe(false);
  });

  it("offers backend-allowed status transitions without approval, archive, or reopen shortcuts", () => {
    expect(nextTicketStatuses("PENDING")).toEqual(["ASSIGNED", "IN_PROGRESS"]);
    expect(nextTicketStatuses("PENDING_APPROVAL")).toEqual([]);
    expect(nextTicketStatuses("IN_PROGRESS")).toContain("RESOLVED");
    expect(nextTicketStatuses("WAITING_FOR_USER")).toContain("CLOSED");
    expect(nextTicketStatuses("RESOLVED")).toEqual(["CLOSED"]);
    expect(nextTicketStatuses("CLOSED")).toEqual([]);
    expect(nextTicketStatuses("ARCHIVED")).toEqual([]);
  });

  it("shows reopen when the server marks the ticket eligible", () => {
    expect(canShowReopenAction(base)).toBe(false);
    expect(
      canShowReopenAction({
        ...base,
        status: "RESOLVED",
        reopen: {
          enabled: true,
          eligible: true,
          createsNewTicket: false,
          windowEndsAt: "2026-01-08T00:00:00.000Z",
        },
      }),
    ).toBe(true);
  });
});
