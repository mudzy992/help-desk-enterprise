// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";

const loadTicketDetailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tickets/load-ticket-detail", () => ({
  loadTicketDetail: loadTicketDetailMock,
}));
vi.mock("@/lib/tickets/use-ticket-realtime", () => ({ useTicketRealtime: vi.fn() }));
vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ currentUserId: "agent-1" }),
}));

describe("useTicketDetail request target", () => {
  beforeEach(() => {
    loadTicketDetailMock.mockReset().mockResolvedValue(undefined);
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
});
