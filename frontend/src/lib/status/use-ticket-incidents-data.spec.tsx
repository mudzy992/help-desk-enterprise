// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { useTicketIncidentsData } from "./use-ticket-incidents-data";

const api = vi.hoisted(() => ({ listTicketIncidents: vi.fn() }));
vi.mock("@/services/status-api", () => api);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const snapshot = (id: string) => ({ staff: true, incidents: [{ id }] });

describe("useTicketIncidentsData", () => {
  beforeEach(() => api.listTicketIncidents.mockReset());

  it("ignores the previous ticket response after identity changes", async () => {
    const first = deferred<ReturnType<typeof snapshot>>();
    const second = deferred<ReturnType<typeof snapshot>>();
    api.listTicketIncidents.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ ticketId, versionKey }) => useTicketIncidentsData(ticketId, versionKey),
      { initialProps: { ticketId: "first", versionKey: "1" } },
    );
    rerender({ ticketId: "second", versionKey: "1" });
    await act(async () => second.resolve(snapshot("second")));
    await waitFor(() => expect(result.current.data?.incidents[0]?.id).toBe("second"));
    await act(async () => first.resolve(snapshot("first")));
    expect(result.current.data?.incidents[0]?.id).toBe("second");
  });

  it("keeps stale data visible on refresh error and exposes request correlation", async () => {
    api.listTicketIncidents.mockResolvedValueOnce(snapshot("one"));
    const { result } = renderHook(() => useTicketIncidentsData("ticket", "1"));
    await waitFor(() => expect(result.current.data?.incidents[0]?.id).toBe("one"));
    api.listTicketIncidents.mockRejectedValueOnce(
      new ApiError(503, "UNAVAILABLE", "offline", "req-incidents"),
    );
    await act(async () => result.current.reload());
    expect(result.current.data?.incidents[0]?.id).toBe("one");
    expect(result.current.error?.requestId).toBe("req-incidents");
  });
});
