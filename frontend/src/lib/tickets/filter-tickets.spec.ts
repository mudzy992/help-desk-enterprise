import { describe, expect, it } from "vitest";
import {
  clearedTicketListFilters,
  filterTickets,
  type TicketListFilters,
} from "@/lib/tickets/filter-tickets";
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

function filters(overrides: Partial<TicketListFilters> = {}): TicketListFilters {
  return {
    view: "all",
    search: "",
    status: "",
    priority: "",
    serviceId: "",
    assignedUserId: "",
    createdFrom: "",
    createdTo: "",
    overdue: false,
    currentUserId: "agent-1",
    ...overrides,
  };
}

describe("filterTickets", () => {
  const rows = [
    ticket({ id: "a", title: "VPN down", assignedUserId: null, isOverdue: true }),
    ticket({
      id: "b",
      title: "Laptop request",
      status: "ASSIGNED",
      priority: "LOW",
      assignedUserId: "agent-1",
      requesterId: "user-2",
      serviceId: "svc-2",
    }),
    ticket({
      id: "c",
      title: "VPN account",
      priority: "HIGH",
      isOverdue: true,
      serviceId: "svc-2",
    }),
  ];

  it("filters by search, status, priority, and service", () => {
    expect(filterTickets(rows, filters({ search: "vpn" })).map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
    expect(
      filterTickets(
        rows,
        filters({ status: "ASSIGNED", priority: "LOW", serviceId: "svc-2" }),
      ).map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("distinguishes assigned, requested, and unassigned views", () => {
    expect(filterTickets(rows, filters({ view: "assigned" })).map((item) => item.id)).toEqual([
      "b",
    ]);
    expect(
      filterTickets(rows, filters({ view: "requested", currentUserId: "user-1" })).map(
        (item) => item.id,
      ),
    ).toEqual(["a", "c"]);
    expect(filterTickets(rows, filters({ view: "unassigned" })).map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("filters overdue tickets together with search and existing filters", () => {
    expect(filterTickets(rows, filters({ overdue: true })).map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
    expect(
      filterTickets(rows, filters({ overdue: true, search: "vpn", priority: "HIGH" })).map(
        (item) => item.id,
      ),
    ).toEqual(["a", "c"]);
    expect(
      filterTickets(rows, filters({ overdue: true, serviceId: "svc-2" })).map((item) => item.id),
    ).toEqual(["c"]);
    expect(
      filterTickets(rows, filters({ overdue: true, status: "ASSIGNED" })).map((item) => item.id),
    ).toEqual([]);
  });

  it("clears overdue and other filters back to the full result", () => {
    const narrowed = filterTickets(rows, filters({ overdue: true, search: "vpn" }));
    expect(narrowed.map((item) => item.id)).toEqual(["a", "c"]);
    expect(
      filterTickets(rows, clearedTicketListFilters(filters({ overdue: true, search: "vpn" }))).map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
