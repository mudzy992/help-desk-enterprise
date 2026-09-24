import { describe, expect, it } from "vitest";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import {
  toTicketCountsQuery,
  toTicketPageQuery,
} from "@/lib/tickets/ticket-page-query";

const filters = (overrides: Partial<TicketListFilters> = {}): TicketListFilters => ({
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
});

describe("toTicketPageQuery", () => {
  it("asks for one page of the default page size", () => {
    expect(
      toTicketPageQuery({
        filters: filters(),
        view: "all",
        currentUserId: "agent-1",
        page: 2,
      }),
    ).toMatchObject({ page: 2, pageSize: 25 });
  });

  it("maps the workspace views onto the server vocabulary", () => {
    const mine = toTicketPageQuery({
      filters: filters(),
      view: "assigned",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(mine.assignedUserId).toBe("agent-1");
    expect(mine.requesterId).toBeUndefined();

    const requested = toTicketPageQuery({
      filters: filters(),
      view: "requested",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(requested.requesterId).toBe("agent-1");

    const unassigned = toTicketPageQuery({
      filters: filters(),
      view: "unassigned",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(unassigned.unassigned).toBe(true);
  });

  it("passes the narrowing filters through and drops the empty ones", () => {
    const query = toTicketPageQuery({
      filters: filters({
        status: "IN_PROGRESS",
        priority: "HIGH",
        serviceId: "svc-1",
        createdFrom: "2026-01-01",
        overdue: true,
      }),
      view: "all",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(query).toMatchObject({
      status: "IN_PROGRESS",
      priority: "HIGH",
      serviceId: "svc-1",
      createdFrom: "2026-01-01",
      overdue: true,
    });
    expect(query.assignedUserId).toBeUndefined();
    expect(query.q).toBeUndefined();
  });

  it("searches titles, numbers and the description for the list search box", () => {
    const query = toTicketPageQuery({
      filters: filters({ search: "  vpn  " }),
      view: "all",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(query.q).toBe("vpn");
    expect(query.searchDescription).toBe(true);
  });

  it("lets the view win over a contradictory assignee filter", () => {
    const query = toTicketPageQuery({
      filters: filters({ assignedUserId: "someone-else" }),
      view: "assigned",
      currentUserId: "agent-1",
      page: 1,
    });
    expect(query.assignedUserId).toBe("agent-1");
  });
});

describe("toTicketCountsQuery", () => {
  it("keeps the narrowing that the counters share with the list", () => {
    const page = toTicketPageQuery({
      filters: filters({ serviceId: "svc-1", search: "vpn", status: "PENDING" }),
      view: "assigned",
      currentUserId: "agent-1",
      page: 3,
    });
    const counts = toTicketCountsQuery(page);
    expect(counts).toEqual({
      originUnitId: undefined,
      serviceId: "svc-1",
      assignedUserId: "agent-1",
      priority: undefined,
      requesterId: undefined,
      groupId: undefined,
      unassigned: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      q: "vpn",
    });
    expect(counts).not.toHaveProperty("status");
    expect(counts).not.toHaveProperty("page");
  });
});
