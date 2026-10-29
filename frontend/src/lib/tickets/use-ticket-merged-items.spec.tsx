// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTicketMergedItems } from "@/lib/tickets/use-ticket-merged-items";
import { reportClientError } from "@/lib/app/client-logger";
import { listMergedTickets } from "@/services/tickets-merge-api";
import type { MergedTicketItem } from "@/services/tickets-merge-api";

vi.mock("@/lib/app/client-logger", () => ({
  reportClientError: vi.fn(),
}));
vi.mock("@/services/tickets-merge-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-merge-api")>();
  return { ...actual, listMergedTickets: vi.fn() };
});

afterEach(cleanup);

describe("useTicketMergedItems", () => {
  it("surfaces merged-ticket read failures and retries without silently showing an empty list", async () => {
    const row: MergedTicketItem = {
      id: "child-1",
      ticketNumber: "T-000002",
      title: "Child ticket",
      status: "CLOSED",
      requesterId: "user-1",
      requesterName: "User One",
      mergedAt: "2026-10-13T10:00:00.000Z",
    };
    vi.mocked(listMergedTickets).mockRejectedValueOnce(new Error("merged read failed"));
    const { result } = renderHook(() => useTicketMergedItems("ticket-1", "revision-1", true));

    await waitFor(() => expect(result.current.errorKey).toBe("tickets.errorGeneric"));
    expect(result.current.items).toEqual([]);
    expect(reportClientError).toHaveBeenCalledWith("ticket_merged_list_failed", expect.any(Error));

    vi.mocked(listMergedTickets).mockResolvedValueOnce([row]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toEqual([row]));
    expect(result.current.errorKey).toBeNull();
  });
});
