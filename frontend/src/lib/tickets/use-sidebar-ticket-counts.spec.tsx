// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarTicketCounts } from "@/lib/tickets/use-sidebar-ticket-counts";
import { ticketCountsQueryOptions } from "@/lib/tickets/ticket-counts-query";
import { getTicketCounts, type TicketCounts } from "@/services/tickets-counts-api";

vi.mock("@/services/tickets-counts-api", () => ({
  getTicketCounts: vi.fn(),
}));

const counts: TicketCounts = {
  open: 9,
  unroutedWithoutRule: 1,
  unroutedQueue: 2,
  inbox: 4,
  overdue: 0,
  atRisk: 0,
  byStatus: {
    PENDING: 1,
    UNROUTED: 1,
    PENDING_APPROVAL: 0,
    ASSIGNED: 2,
    IN_PROGRESS: 2,
    WAITING_FOR_USER: 1,
    RESOLVED: 0,
    CLOSED: 0,
    ARCHIVED: 0,
  },
};

function wrapperFor(client: QueryClient) {
  return function QueryProvider({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useSidebarTicketCounts", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(getTicketCounts).mockReset().mockResolvedValue(counts);
  });

  afterEach(() => {
    cleanup();
    client.clear();
  });

  it("reuses the same React Query entry as an unfiltered ticket-list count", async () => {
    const listCountQuery = {
      originUnitId: undefined,
      serviceId: undefined,
      assignedUserId: undefined,
      priority: undefined,
      requesterId: undefined,
      groupId: undefined,
      unassigned: undefined,
      forwarded: undefined,
      following: undefined,
      mentionedMe: undefined,
      hideMerged: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      q: undefined,
    };
    client.setQueryData(ticketCountsQueryOptions(listCountQuery).queryKey, counts);

    const { result } = renderHook(() => useSidebarTicketCounts(true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        openTicketCount: 9,
        inboxBadgeCount: 6,
        unroutedCount: 2,
      }),
    );
    expect(getTicketCounts).not.toHaveBeenCalled();
  });

  it("uses React Query's stale/refetch lifecycle instead of a module TTL cache", async () => {
    const { result } = renderHook(() => useSidebarTicketCounts(false), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current?.openTicketCount).toBe(9));
    expect(result.current?.inboxBadgeCount).toBe(2);
    expect(getTicketCounts).toHaveBeenCalledOnce();

    await client.invalidateQueries({ queryKey: ticketCountsQueryOptions().queryKey });
    await waitFor(() => expect(getTicketCounts).toHaveBeenCalledTimes(2));
  });
});
