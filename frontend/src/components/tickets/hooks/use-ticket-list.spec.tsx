// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHelpdeskQueryClient } from "@/lib/query/query-client";
import { ToastProvider } from "@/components/ui/toast";
import { useTicketList } from "@/components/tickets/hooks/use-ticket-list";
import { getTicketCounts, type TicketCounts } from "@/services/tickets-counts-api";
import { listOfferedServices } from "@/services/service-catalog-api";
import {
  listTicketsPage,
  type TicketPage,
  type TicketResponse,
  type TicketStatus,
} from "@/services/tickets-api";

const reportClientErrorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/app/client-logger", () => ({ reportClientError: reportClientErrorMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ session: null, currentUserId: "user-1" }),
}));

const capabilityState = vi.hoisted(() => ({ isLoading: false, isStaff: false }));

vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: capabilityState.isStaff
      ? {
          isSuperAdmin: false,
          roleKeys: ["AGENT"],
          permissionKeys: [],
          principal: { subjectId: "agent-1" },
        }
      : null,
    isLoading: capabilityState.isLoading,
    retry: () => undefined,
    hasPermission: () => false,
    hasRole: (role: string) => capabilityState.isStaff && role === "AGENT",
  }),
}));

vi.mock("@/services/tickets-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-api")>();
  return { ...actual, listTicketsPage: vi.fn() };
});

vi.mock("@/services/tickets-counts-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-counts-api")>();
  return { ...actual, getTicketCounts: vi.fn() };
});

vi.mock("@/services/service-catalog-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/service-catalog-api")>();
  return { ...actual, listOfferedServices: vi.fn() };
});

function ticketRow(id: string): TicketResponse {
  return {
    id,
    ticketNumber: `T-${id}`,
    title: `Tiket ${id}`,
    description: "opis",
    status: "PENDING",
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "MEDIUM",
    classification: "INTERNAL",
    requestType: null,
    dueAt: null,
    isConfidential: false,
    formData: null,
    originUnitId: "ou-1",
    serviceId: "svc-1",
    formVersionRef: null,
    requesterId: "user-1",
    assignedGroupId: null,
    assignedUserId: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  };
}

function ticketPage(items: readonly TicketResponse[]): TicketPage {
  return { items, total: items.length, page: 1, pageSize: 25, totalsAsOf: 1_760_000_000_000 };
}

const countsByStatus: Record<TicketStatus, number> = {
  PENDING: 1,
  UNROUTED: 0,
  PENDING_APPROVAL: 0,
  ASSIGNED: 1,
  IN_PROGRESS: 1,
  WAITING_FOR_USER: 0,
  RESOLVED: 0,
  CLOSED: 0,
  ARCHIVED: 0,
};

const counts: TicketCounts = {
  open: 3,
  unroutedWithoutRule: 0,
  unroutedQueue: 0,
  inbox: 0,
  overdue: 0,
  atRisk: 0,
  byStatus: countsByStatus,
};

type DeferredPage = {
  readonly resolve: (page: TicketPage) => void;
  readonly reject: (error: Error) => void;
};

describe("useTicketList: which answer reaches the screen (T1, T26)", () => {
  let queryClient: ReturnType<typeof createHelpdeskQueryClient>;
  let initialEntry = "/tickets?view=all";
  /** Zahtjevi liste ostaju otvoreni dok ih test ne razriješi, jedan po jedan. */
  let pendingPages: DeferredPage[];

  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ToastProvider>{children}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    pendingPages = [];
    reportClientErrorMock.mockReset();
    initialEntry = "/tickets?view=all";
    capabilityState.isLoading = false;
    capabilityState.isStaff = false;
    queryClient = createHelpdeskQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    vi.mocked(listOfferedServices).mockReset();
    vi.mocked(listOfferedServices).mockResolvedValue([]);
    vi.mocked(getTicketCounts).mockReset();
    vi.mocked(getTicketCounts).mockResolvedValue(counts);
    vi.mocked(listTicketsPage).mockReset();
    vi.mocked(listTicketsPage).mockImplementation(
      () =>
        new Promise<TicketPage>((resolve, reject) => {
          pendingPages.push({ resolve, reject });
        }),
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("drops the answer of an older filter change even when it lands last", async () => {
    const { result } = renderHook(() => useTicketList(), { wrapper });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setFilters({ ...result.current.filters, search: "vpn" });
    });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(2));

    // Prvo odgovori noviji zahtjev, a zatim zastarjeli.
    await act(async () => {
      pendingPages[1]?.resolve(ticketPage([ticketRow("nova")]));
    });
    await act(async () => {
      pendingPages[0]?.resolve(ticketPage([ticketRow("stara")]));
    });

    expect(result.current.pageItems.map((item) => item.id)).toEqual(["nova"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("waits for staff capabilities so the first request uses URL deep-link filters", async () => {
    initialEntry = "/tickets?view=all&personal=mentionedMe&forwarded=toMyGroups";
    capabilityState.isLoading = true;
    const { rerender } = renderHook(() => useTicketList(), { wrapper });
    expect(listTicketsPage).not.toHaveBeenCalled();

    capabilityState.isStaff = true;
    capabilityState.isLoading = false;
    await act(async () => rerender());
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(1));
    expect(listTicketsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        forwarded: "toMyGroups",
        mentionedMe: true,
        hideMerged: true,
      }),
    );
    await act(async () => {
      pendingPages[0]?.resolve(ticketPage([]));
    });
  });

  it("keeps the last page and exposes a recoverable error when silent refresh fails", async () => {
    const { result } = renderHook(() => useTicketList(), { wrapper });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(1));
    await act(async () => {
      pendingPages[0]?.resolve(ticketPage([ticketRow("stable")]));
    });

    let silentReload: Promise<void> | undefined;
    act(() => {
      silentReload = result.current.load(true);
    });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(2));
    act(() => {
      pendingPages[1]?.reject(new Error("offline"));
    });
    await act(async () => {
      await silentReload;
    });

    expect(result.current.pageItems.map((item) => item.id)).toEqual(["stable"]);
    expect(result.current.refreshErrorKey).toBe("tickets.errorGeneric");
    expect(result.current.errorKey).toBeNull();
    expect(reportClientErrorMock).toHaveBeenCalledWith(
      "ticket_list_refresh_failed",
      expect.any(Error),
    );

    let recovery: Promise<void> | undefined;
    act(() => {
      recovery = result.current.load(true);
    });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(3));
    await act(async () => {
      pendingPages[2]?.resolve(ticketPage([ticketRow("recovered")]));
      await recovery;
    });
    expect(result.current.refreshErrorKey).toBeNull();
    expect(result.current.pageItems.map((item) => item.id)).toEqual(["recovered"]);
  });

  it("reads the server again on a silent reload instead of the fresh cache", async () => {
    const { result } = renderHook(() => useTicketList(), { wrapper });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(1));
    await act(async () => {
      pendingPages[0]?.resolve(ticketPage([ticketRow("prva")]));
    });
    expect(result.current.pageItems.map((item) => item.id)).toEqual(["prva"]);
    expect(getTicketCounts).toHaveBeenCalledTimes(1);

    let silentReload: Promise<void> | undefined;
    act(() => {
      silentReload = result.current.load(true);
    });
    await waitFor(() => expect(listTicketsPage).toHaveBeenCalledTimes(2));

    await act(async () => {
      pendingPages[1]?.resolve(ticketPage([ticketRow("druga")]));
      await silentReload;
    });

    expect(listTicketsPage).toHaveBeenCalledTimes(2);
    expect(getTicketCounts).toHaveBeenCalledTimes(2);
    expect(result.current.pageItems.map((item) => item.id)).toEqual(["druga"]);
  });
});
