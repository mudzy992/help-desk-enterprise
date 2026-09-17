import { describe, expect, it } from "vitest";
import {
  countOpenTicketsForSlaProfile,
  countSlaPriorityExposure,
} from "@/lib/sla/count-sla-profile-exposure";
import type { TicketResponse } from "@/services/tickets-api";

function ticket(overrides: Partial<TicketResponse>): TicketResponse {
  return {
    id: "t1",
    ticketNumber: "HD-1",
    title: "x",
    description: "y",
    status: "ASSIGNED",
    priority: "HIGH",
    impact: "HIGH",
    urgency: "HIGH",
    classification: "INCIDENT",
    isConfidential: false,
    formData: {},
    originUnitId: "ou-1",
    serviceId: "svc-1",
    formVersionRef: "fv-1",
    requesterId: "u-1",
    assignedGroupId: null,
    assignedUserId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("count-sla-profile-exposure", () => {
  it("counts open tickets for a profile and splits at-risk vs breached", () => {
    const tickets = [
      ticket({
        id: "a",
        priority: "HIGH",
        isAtRisk: true,
        sla: {
          slaProfileId: "p1",
          startedAt: "2026-09-01T00:00:00.000Z",
          responseDueAt: null,
          resolutionDueAt: null,
          respondedAt: null,
          resolutionCompletedAt: null,
          pausedAt: null,
          isResponseBreached: false,
          isResolutionBreached: false,
          isResponseAtRisk: true,
          isResolutionAtRisk: false,
        },
      }),
      ticket({
        id: "b",
        priority: "HIGH",
        isOverdue: true,
        sla: {
          slaProfileId: "p1",
          startedAt: "2026-09-01T00:00:00.000Z",
          responseDueAt: null,
          resolutionDueAt: null,
          respondedAt: null,
          resolutionCompletedAt: null,
          pausedAt: null,
          isResponseBreached: true,
          isResolutionBreached: false,
          isResponseAtRisk: false,
          isResolutionAtRisk: false,
        },
      }),
      ticket({
        id: "c",
        status: "CLOSED",
        sla: {
          slaProfileId: "p1",
          startedAt: "2026-09-01T00:00:00.000Z",
          responseDueAt: null,
          resolutionDueAt: null,
          respondedAt: null,
          resolutionCompletedAt: null,
          pausedAt: null,
          isResponseBreached: false,
          isResolutionBreached: false,
          isResponseAtRisk: false,
          isResolutionAtRisk: false,
        },
      }),
      ticket({
        id: "d",
        priority: "LOW",
        sla: {
          slaProfileId: "p2",
          startedAt: "2026-09-01T00:00:00.000Z",
          responseDueAt: null,
          resolutionDueAt: null,
          respondedAt: null,
          resolutionCompletedAt: null,
          pausedAt: null,
          isResponseBreached: false,
          isResolutionBreached: false,
          isResponseAtRisk: false,
          isResolutionAtRisk: false,
        },
      }),
    ];

    expect(countOpenTicketsForSlaProfile(tickets, "p1")).toBe(2);
    expect(countSlaPriorityExposure(tickets, "p1", "HIGH")).toEqual({
      open: 2,
      atRisk: 1,
      breached: 1,
    });
  });
});
