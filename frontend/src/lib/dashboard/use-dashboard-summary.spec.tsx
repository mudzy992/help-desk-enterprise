// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";
import { invalidateDashboardQueries } from "@/lib/dashboard/invalidate-dashboard-queries";
import { reportClientError } from "@/lib/app/client-logger";
import { loadDashboardPrimary } from "@/lib/dashboard/load-dashboard-primary";
import { listGroupInboxPage } from "@/services/tickets-api";

const realtime = vi.hoisted(() => ({ reload: null as null | (() => Promise<void>) }));
const session = vi.hoisted(() => ({ currentUserId: "user-1" as string | null }));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ currentUserId: session.currentUserId }),
}));
vi.mock("@/lib/dashboard/use-local-day-key", () => ({ useLocalDayKey: () => "2026-10-19" }));
vi.mock("@/lib/app/client-logger", () => ({ reportClientError: vi.fn() }));
vi.mock("@/lib/dashboard/load-dashboard-primary", () => ({ loadDashboardPrimary: vi.fn() }));
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
vi.mock("@/services/tickets-api", () => ({
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

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
    session.currentUserId = "user-1";
    vi.mocked(loadDashboardPrimary)
      .mockReset()
      .mockResolvedValue({ marker: "summary" } as never);
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
    expect(loadDashboardPrimary).toHaveBeenCalled();
  });

  it("exposes a critical-load error without stale summary data", async () => {
    vi.mocked(loadDashboardPrimary).mockRejectedValueOnce(new Error("offline"));
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
    await waitFor(() => expect(loadDashboardPrimary).toHaveBeenCalled());

    await act(async () => realtime.reload?.());
    expect(invalidateDashboardQueries).toHaveBeenCalledWith(client);
  });

  it("marks a failed silent reload stale, reports it, and clears the signal on recovery", async () => {
    const { result } = renderHook(() => useDashboardSummary(false), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(loadDashboardPrimary).mockRejectedValueOnce(new Error("offline"));

    await act(async () => realtime.reload?.());
    expect(result.current.isStale).toBe(true);
    expect(reportClientError).toHaveBeenCalledWith(
      "dashboard.silent_reload_failed",
      expect.any(Error),
      null,
    );

    vi.mocked(loadDashboardPrimary).mockResolvedValueOnce({ marker: "recovered" } as never);
    await act(async () => realtime.reload?.());
    expect(result.current.isStale).toBe(false);
    expect(result.current.summary).toEqual({ marker: "recovered" });
  });

  it("ignores an older response after the session principal changes", async () => {
    const oldLoad = deferred<never>();
    vi.mocked(loadDashboardPrimary).mockReturnValueOnce(oldLoad.promise);
    const { result, rerender } = renderHook(() => useDashboardSummary(false), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(loadDashboardPrimary).toHaveBeenCalledTimes(1));

    session.currentUserId = "user-2";
    vi.mocked(loadDashboardPrimary).mockResolvedValueOnce({ marker: "user-2" } as never);
    rerender();
    await waitFor(() => expect(result.current.summary).toEqual({ marker: "user-2" }));

    await act(async () => oldLoad.resolve({ marker: "user-1" } as never));
    expect(result.current.summary).toEqual({ marker: "user-2" });
  });
});
