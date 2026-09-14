import { describe, expect, it } from "vitest";
import {
  applyTicketListTab,
  ticketListTabKey,
} from "@/components/tickets/ticket-list-filters";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";

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

describe("ticket list SLA risk tab", () => {
  it("maps RISK onto overdue without a status filter", () => {
    const next = applyTicketListTab(filters({ status: "ASSIGNED" }), "RISK");
    expect(next.overdue).toBe(true);
    expect(next.status).toBe("");
    expect(ticketListTabKey(next)).toBe("RISK");
  });

  it("clears overdue when a status or ALL tab is selected", () => {
    const fromRisk = filters({ overdue: true });
    expect(applyTicketListTab(fromRisk, "ALL")).toEqual(
      expect.objectContaining({ overdue: false, status: "" }),
    );
    expect(applyTicketListTab(fromRisk, "ASSIGNED")).toEqual(
      expect.objectContaining({ overdue: false, status: "ASSIGNED" }),
    );
  });
});
