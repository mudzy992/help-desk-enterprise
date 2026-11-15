// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useTicketListData } from "@/lib/tickets/use-ticket-list-data";
import { fetchTicketListSnapshot } from "@/lib/tickets/fetch-ticket-list-snapshot";

const realtime = vi.hoisted(() => ({
  reload: null as null | (() => Promise<void>),
  invalidate: null as null | (() => void),
}));
vi.mock("@/lib/realtime/use-ticket-collection-realtime", () => ({
  useTicketCollectionRealtime: (reload: () => Promise<void>, invalidate: () => void) => {
    realtime.reload = reload;
    realtime.invalidate = invalidate;
  },
}));
vi.mock("@/lib/tickets/fetch-ticket-list-snapshot", () => ({
  fetchTicketListSnapshot: vi.fn(),
  lastPageForEmptyPage: () => null,
}));

it("does not paint a delayed list snapshot after realtime invalidation", async () => {
  let resolveOld!: (value: unknown) => void;
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const snapshot = (id: string) => ({
    services: [],
    catalogErrorKey: null,
    pageItems: [{ id }],
    pageInfo: { page: 1, pageSize: 25, total: 1, totalIsCapped: false },
    inboxGroupId: null,
    counts: null,
    countsErrorKey: null,
    unroutedTickets: [],
    unroutedTotal: 0,
    unroutedPageInfo: null,
    unroutedErrorKey: null,
    membershipErrorKey: null,
    hasGroupMembership: null,
  });
  vi.mocked(fetchTicketListSnapshot)
    .mockReset()
    .mockReturnValueOnce(old as never)
    .mockResolvedValueOnce(snapshot("fresh") as never);
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const input = {
    enabled: true,
    view: "all" as const,
    filters: {} as never,
    page: 1,
    setPage: vi.fn(),
    unroutedPage: 1,
    setUnroutedPage: vi.fn(),
    currentUserId: "user-1",
    setSearchParams: vi.fn() as never,
  };
  const { result, unmount } = renderHook(() => useTicketListData(input), { wrapper });
  await waitFor(() => expect(fetchTicketListSnapshot).toHaveBeenCalledTimes(1));
  act(() => realtime.invalidate?.());
  await act(async () => {
    resolveOld(snapshot("stale"));
    await old;
  });
  expect(result.current.pageItems).toEqual([]);
  await act(async () => realtime.reload?.());
  expect(result.current.pageItems.map((item) => item.id)).toEqual(["fresh"]);
  unmount();
  client.clear();
});
