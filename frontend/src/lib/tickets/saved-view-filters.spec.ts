import { describe, expect, it } from "vitest";
import { filtersFromSavedView, savedViewMatchesFilters } from "@/lib/tickets/saved-view-filters";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";

describe("saved-view-filters", () => {
  it("applies saved filters without changing the workspace view", () => {
    const current: TicketListFilters = {
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
    };
    const next = filtersFromSavedView(current, {
      id: "v1",
      name: "High",
      filters: { priority: "HIGH", search: "vpn" },
      sort: { field: "updatedAt", direction: "desc" },
      columns: ["number"],
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next.view).toBe("all");
    expect(next.priority).toBe("HIGH");
    expect(next.search).toBe("vpn");
    expect(next.overdue).toBe(false);
  });

  it("restores a saved overdue filter", () => {
    const current: TicketListFilters = {
      view: "all",
      search: "old",
      status: "",
      priority: "",
      serviceId: "",
      assignedUserId: "",
      createdFrom: "",
      createdTo: "",
      overdue: false,
      currentUserId: "agent-1",
    };
    const next = filtersFromSavedView(current, {
      id: "v2",
      name: "Overdue high",
      filters: { priority: "HIGH", overdue: true },
      sort: { field: "updatedAt", direction: "desc" },
      columns: ["number"],
      isDefault: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next.overdue).toBe(true);
    expect(next.priority).toBe("HIGH");
    expect(next.search).toBe("");
  });
});

describe("savedViewMatchesFilters", () => {
  const base: TicketListFilters = {
    view: "all",
    search: "vpn",
    status: "",
    priority: "HIGH",
    serviceId: "",
    assignedUserId: "",
    createdFrom: "",
    createdTo: "",
    overdue: false,
    currentUserId: "agent-1",
  };
  const view = {
    id: "v1",
    name: "High VPN",
    filters: { search: "vpn", priority: "HIGH" },
    sort: { field: "updatedAt" as const, direction: "desc" as const },
    columns: ["number"],
    isDefault: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("matches while the list shows the view's filters", () => {
    expect(savedViewMatchesFilters(view, base)).toBe(true);
  });

  it("stops matching when the user edits any stored filter", () => {
    expect(savedViewMatchesFilters(view, { ...base, search: "printer" })).toBe(false);
    expect(savedViewMatchesFilters(view, { ...base, priority: "LOW" })).toBe(false);
    expect(savedViewMatchesFilters(view, { ...base, overdue: true })).toBe(false);
  });

  it("ignores filters the view does not store", () => {
    expect(savedViewMatchesFilters(view, { ...base, forwarded: "any" })).toBe(true);
    expect(savedViewMatchesFilters(view, { ...base, hideMerged: true })).toBe(true);
    expect(savedViewMatchesFilters(view, { ...base, view: "mine" })).toBe(true);
  });
});
