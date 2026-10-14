// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTicketTimeTracking } from "@/lib/time-tracking/use-ticket-time-tracking";
import { reportClientError } from "@/lib/app/client-logger";
import { listTicketTimeLogs } from "@/services/tickets-collaboration-api";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

vi.mock("@/lib/time-tracking/active-timer-store", () => ({
  useActiveTimer: () => ({ timer: null, policy: null, generation: 0, pausedTicket: null }),
  markActiveTimerChanged: vi.fn(),
}));

vi.mock("@/lib/app/client-logger", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@/services/tickets-collaboration-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-collaboration-api")>();
  return { ...actual, listTicketTimeLogs: vi.fn() };
});

afterEach(cleanup);

describe("useTicketTimeTracking auxiliary reads", () => {
  it("reports a failed list read, exposes a retry, then clears the error on success", async () => {
    const setTimeLogs: Dispatch<SetStateAction<readonly TicketTimeLogResponse[]>> = vi.fn();
    vi.mocked(listTicketTimeLogs).mockRejectedValueOnce(new Error("time logs unavailable"));
    const { result } = renderHook(() =>
      useTicketTimeTracking({ ticketId: "ticket-1", setTimeLogs, canManage: false }),
    );

    await act(async () => result.current.reload());
    expect(result.current.errorKey).toBe("tickets.timeTracking.errors.generic");
    expect(reportClientError).toHaveBeenCalledWith(
      "ticket_time_logs_load_failed",
      expect.any(Error),
    );

    vi.mocked(listTicketTimeLogs).mockResolvedValueOnce([]);
    await act(async () => result.current.reload());
    expect(setTimeLogs).toHaveBeenCalledWith([]);
    expect(result.current.errorKey).toBeNull();
  });
});
