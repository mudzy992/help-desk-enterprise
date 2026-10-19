import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTicketListSnapshot } from "@/lib/tickets/fetch-ticket-list-snapshot";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { getGroupInboxStatus, listGroupInboxPage, listTicketsPage } from "@/services/tickets-api";
import { listOfferedServices } from "@/services/service-catalog-api";
import { getTicketCounts } from "@/services/tickets-counts-api";

vi.mock("@/services/tickets-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-api")>();
  return {
    ...actual,
    getGroupInboxStatus: vi.fn(),
    listGroupInboxPage: vi.fn(),
    listTicketsPage: vi.fn(),
  };
});

vi.mock("@/services/service-catalog-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/service-catalog-api")>();
  return { ...actual, listOfferedServices: vi.fn() };
});

vi.mock("@/services/tickets-counts-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-counts-api")>();
  return { ...actual, getTicketCounts: vi.fn() };
});

const filters: TicketListFilters = {
  view: "inbox",
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

describe("fetchTicketListSnapshot inbox reads", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listOfferedServices).mockReset().mockRejectedValue(new Error("catalog offline"));
    vi.mocked(listGroupInboxPage).mockReset().mockResolvedValue({
      items: [],
      total: 0,
      totalIsCapped: false,
      totalsAsOf: Date.now(),
      page: 1,
      pageSize: 25,
    });
    vi.mocked(getGroupInboxStatus).mockReset().mockResolvedValue({ hasGroupMembership: true });
    vi.mocked(listTicketsPage).mockReset().mockRejectedValue(new Error("unrouted offline"));
  });

  it("keeps catalog and unrouted read failures visible instead of turning them into zero rows", async () => {
    const snapshot = await fetchTicketListSnapshot({
      view: "inbox",
      filters,
      page: 1,
      unroutedPage: 1,
      currentUserId: "agent-1",
      queryClient,
      silent: false,
    });

    expect(snapshot.services).toEqual([]);
    expect(snapshot.catalogErrorKey).toBe("tickets.errorGeneric");
    expect(snapshot.unroutedTickets).toEqual([]);
    expect(snapshot.unroutedTotal).toBe(0);
    expect(snapshot.unroutedErrorKey).toBe("tickets.errorGeneric");
    expect(snapshot.membershipErrorKey).toBeNull();
    expect(snapshot.inboxGroupId).toBeNull();
    expect(listGroupInboxPage).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it("keeps a failed group-membership status read distinct from an empty inbox", async () => {
    vi.mocked(getGroupInboxStatus).mockRejectedValueOnce(new Error("membership offline"));
    const snapshot = await fetchTicketListSnapshot({
      view: "inbox",
      filters,
      page: 1,
      unroutedPage: 1,
      currentUserId: "agent-1",
      queryClient,
      silent: false,
    });

    expect(snapshot.hasGroupMembership).toBeNull();
    expect(snapshot.membershipErrorKey).toBe("tickets.errorGeneric");
    queryClient.clear();
  });

  it("reports a counts failure instead of representing it as zero", async () => {
    vi.mocked(listTicketsPage).mockReset().mockResolvedValueOnce({
      items: [],
      total: 0,
      totalIsCapped: false,
      page: 1,
      pageSize: 25,
    });
    vi.mocked(getTicketCounts).mockReset().mockRejectedValueOnce(new Error("counts offline"));

    const snapshot = await fetchTicketListSnapshot({
      view: "all",
      filters: { ...filters, view: "all" },
      page: 1,
      unroutedPage: 1,
      currentUserId: "agent-1",
      queryClient,
      silent: false,
    });

    expect(snapshot.counts).toBeNull();
    expect(snapshot.countsErrorKey).toBe("tickets.errorGeneric");
    queryClient.clear();
  });

  it("loads the selected group page and preserves its server pagination metadata", async () => {
    vi.mocked(listGroupInboxPage).mockResolvedValueOnce({
      items: [],
      total: 76,
      totalIsCapped: true,
      totalsAsOf: Date.now(),
      page: 2,
      pageSize: 25,
    });

    const snapshot = await fetchTicketListSnapshot({
      view: "inbox",
      filters: { ...filters, inboxTab: "group-1" },
      page: 2,
      unroutedPage: 1,
      currentUserId: "agent-1",
      queryClient,
      silent: false,
    });

    expect(listGroupInboxPage).toHaveBeenCalledWith({
      groupId: "group-1",
      page: 2,
      pageSize: 25,
    });
    expect(snapshot.pageInfo).toEqual({
      page: 2,
      pageSize: 25,
      total: 76,
      totalIsCapped: true,
    });
    expect(snapshot.inboxGroupId).toBe("group-1");
    queryClient.clear();
  });
});
