// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";
import { invalidateDashboardQueries } from "@/lib/dashboard/invalidate-dashboard-queries";
import { fetchDashboardSummary } from "@/services/report-summary-api";
import { listGroupInboxPage, listTicketsPage } from "@/services/tickets-api";

const realtime = vi.hoisted(() => ({ reload: null as null | (() => Promise<void>) }));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ currentUserId: "user-1" }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => null,
}));
vi.mock("@/lib/realtime/use-ticket-collection-realtime", () => ({
  useTicketCollectionRealtime: (reload: () => Promise<void>) => {
    realtime.reload = reload;
  },
}));
vi.mock("@/lib/dashboard/invalidate-dashboard-queries", () => ({
  invalidateDashboardQueries: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/dashboard/load-dashboard-volume", () => ({
  loadDashboardVolume: vi.fn(() => Promise.resolve({ tickets: [], truncated: false })),
}));
vi.mock("@/lib/dashboard/compose-dashboard-summary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard/compose-dashboard-summary")>();
  return {
    ...actual,
    composeDashboardSummary: vi.fn(() => ({ marker: "summary" })),
  };
});
vi.mock("@/services/report-summary-api", () => ({ fetchDashboardSummary: vi.fn() }));
vi.mock("@/services/tickets-api", () => ({
  listTicketsPage: vi.fn(),
  listGroupInboxPage: vi.fn(() => Promise.resolve({ ...emptyPage, total: 0 })),
}));
vi.mock("@/services/service-catalog-api", () => ({
  listServices: vi.fn(() => Promise.resolve([])),
  listOfferedServices: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/services/organizational-units-api", () => ({
  listOrganizationalUnitTree: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/services/routing-api", () => ({
  listRoutingRules: vi.fn(() => Promise.resolve([])),
}));

const emptyPage = { items: [], total: 0, page: 1, pageSize: 25, totalsAsOf: 0 };

function wrapperFor(client: QueryClient) {
  return function QueryProvider({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useDashboardSummary", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    realtime.reload = null;
    vi.mocked(fetchDashboardSummary)
      .mockReset()
      .mockResolvedValue({} as never);
    vi.mocked(listTicketsPage)
      .mockReset()
      .mockResolvedValue(emptyPage as never);
    vi.mocked(listGroupInboxPage)
      .mockReset()
      .mockResolvedValue({ ...emptyPage, total: 0 });
    vi.mocked(invalidateDashboardQueries).mockClear();
  });

  afterEach(() => {
    client.clear();
    vi.clearAllMocks();
  });

  it("loads the critical summary before progressive lookups", async () => {
    const { result } = renderHook(() => useDashboardSummary(false), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorKey).toBeNull();
    expect(result.current.summary).toEqual({ marker: "summary" });
    expect(result.current.serviceNames.size).toBe(0);
    expect(listTicketsPage).toHaveBeenCalled();
  });

  it("exposes a critical-load error without stale summary data", async () => {
    vi.mocked(fetchDashboardSummary).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useDashboardSummary(false), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(result.current.errorKey).not.toBeNull();
  });

  it("uses the inbox page total instead of the number of first-page items", async () => {
    vi.mocked(listGroupInboxPage).mockResolvedValueOnce({
      ...emptyPage,
      items: [],
      total: 73,
      pageSize: 25,
    });
    const { result } = renderHook(() => useDashboardSummary(true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isInboxLoading).toBe(false));
    expect(result.current.inboxCount).toBe(73);
    expect(result.current.inboxTickets).toEqual([]);
    expect(result.current.inboxErrorKey).toBeNull();
  });

  it("keeps an inbox transport failure distinct from an empty inbox", async () => {
    vi.mocked(listGroupInboxPage).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useDashboardSummary(true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isInboxLoading).toBe(false));
    expect(result.current.inboxCount).toBeNull();
    expect(result.current.inboxTickets).toBeNull();
    expect(result.current.inboxErrorKey).not.toBeNull();
  });

  it("invalidates dashboard keys before a realtime silent reload", async () => {
    renderHook(() => useDashboardSummary(false), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(realtime.reload).not.toBeNull());
    await waitFor(() => expect(fetchDashboardSummary).toHaveBeenCalled());

    await act(async () => realtime.reload?.());
    expect(invalidateDashboardQueries).toHaveBeenCalledWith(client);
  });
});
