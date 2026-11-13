// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";

const loadTicketDetailMock = vi.hoisted(() => vi.fn());
const realtime = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ currentUserId: "agent-1" }));

vi.mock("@/lib/tickets/load-ticket-detail", () => ({
  loadTicketDetail: loadTicketDetailMock,
}));
vi.mock("@/lib/tickets/use-ticket-realtime", () => ({ useTicketRealtime: realtime }));
vi.mock("@/services/tickets-api", async (original) => ({
  ...(await original<typeof import("@/services/tickets-api")>()),
  claimTicket: claim,
}));
vi.mock("@/lib/session/use-session", () => ({
  useSession: () => session,
}));

describe("useTicketDetail request target", () => {
  beforeEach(() => {
    loadTicketDetailMock.mockReset().mockResolvedValue(undefined);
    realtime.mockClear();
    claim.mockReset();
    session.currentUserId = "agent-1";
  });

  it("loads once per ticket and does not reload for local state changes", async () => {
    const { result, rerender } = renderHook(
      ({ ticketId }: { readonly ticketId: string }) => useTicketDetail(ticketId),
      { initialProps: { ticketId: "ticket-a" } },
    );

    await waitFor(() => expect(loadTicketDetailMock).toHaveBeenCalledTimes(1));
    act(() => result.current.setActionError("tickets.errorGeneric"));
    rerender({ ticketId: "ticket-a" });
    expect(loadTicketDetailMock).toHaveBeenCalledTimes(1);

    rerender({ ticketId: "ticket-b" });
    await waitFor(() => expect(loadTicketDetailMock).toHaveBeenCalledTimes(2));
    expect(loadTicketDetailMock.mock.calls[1]?.[0]).toMatchObject({
      ticketId: "ticket-b",
      silent: false,
    });
  });
  it("does not restore a revoked ticket when an earlier claim finishes", async () => {
    let resolveClaim!: (value: unknown) => void;
    claim.mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );
    const { result } = renderHook(() => useTicketDetail("ticket-a"));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.claim();
    });
    act(() => realtime.mock.lastCall?.[0].onAccessInvalidated());
    await act(async () => {
      resolveClaim({ id: "ticket-a", title: "stale" });
      await pending;
    });
    expect(result.current.ticket).toBeNull();
  });

  it("does not apply a previous user's delayed action after identity changes", async () => {
    let resolveClaim!: (value: unknown) => void;
    claim.mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );
    const { result, rerender } = renderHook(() => useTicketDetail("ticket-a"));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.claim();
    });
    session.currentUserId = "agent-2";
    rerender();
    await act(async () => {
      resolveClaim({ id: "ticket-a", title: "stale" });
      await pending;
    });
    expect(result.current.ticket).toBeNull();
    expect(loadTicketDetailMock).toHaveBeenCalledTimes(2);
  });
});
