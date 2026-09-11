import { describe, expect, it } from "vitest";
import { filterTickets } from "@/lib/tickets/filter-tickets";
import type { TicketResponse } from "@/services/tickets-api";

function ticket(
  overrides: Partial<TicketResponse> & Pick<TicketResponse, "id">,
): TicketResponse {
  return {
    ticketNumber: "T-000001",
    title: "VPN access",
    description: "Cannot connect",
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
    ...overrides,
  };
}

describe("filterTickets", () => {
  const rows = [
    ticket({ id: "a", title: "VPN down", assignedUserId: null }),
    ticket({
      id: "b",
      title: "Laptop request",
      status: "ASSIGNED",
      priority: "LOW",
      assignedUserId: "agent-1",
      requesterId: "user-2",
      serviceId: "svc-2",
    }),
  ];

  it("filters by search, status, priority, and service", () => {
    expect(
      filterTickets(rows, {
        view: "all",
        search: "vpn",
        status: "",
        priority: "",
        serviceId: "",
        currentUserId: "agent-1",
      }).map((item) => item.id),
    ).toEqual(["a"]);
    expect(
      filterTickets(rows, {
        view: "all",
        search: "",
        status: "ASSIGNED",
        priority: "LOW",
        serviceId: "svc-2",
        currentUserId: "agent-1",
      }).map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("distinguishes assigned, requested, and unassigned views", () => {
    expect(
      filterTickets(rows, {
        view: "assigned",
        search: "",
        status: "",
        priority: "",
        serviceId: "",
        currentUserId: "agent-1",
      }).map((item) => item.id),
    ).toEqual(["b"]);
    expect(
      filterTickets(rows, {
        view: "requested",
        search: "",
        status: "",
        priority: "",
        serviceId: "",
        currentUserId: "user-1",
      }).map((item) => item.id),
    ).toEqual(["a"]);
    expect(
      filterTickets(rows, {
        view: "unassigned",
        search: "",
        status: "",
        priority: "",
        serviceId: "",
        currentUserId: "agent-1",
      }).map((item) => item.id),
    ).toEqual(["a"]);
  });
});
