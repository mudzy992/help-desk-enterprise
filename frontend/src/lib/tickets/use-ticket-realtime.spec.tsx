// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { useTicketRealtime } from "@/lib/tickets/use-ticket-realtime";

vi.mock("@/lib/session/use-session", () => ({ useSession: () => sessionState }));
vi.mock("@/services/helpdesk-socket", () => ({
  acquireHelpdeskSocket: () => fake.socket,
  releaseHelpdeskSocket: vi.fn(),
}));
const sessionState = vi.hoisted(() => ({ session: { principal: { subjectId: "user-1" } } }));
const fake = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const acknowledgements: Array<(error: Error | null, response?: unknown) => void> = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    connected: true,
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, fn);
      return socket;
    },
    off: (event: string) => {
      listeners.delete(event);
      return socket;
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return socket;
    },
    timeout: () => ({
      emit: (
        event: string,
        payload: unknown,
        callback: (err: Error | null, response?: unknown) => void,
      ) => {
        emitted.push({ event, payload });
        acknowledgements.push(callback);
        return socket;
      },
    }),
  };
  return {
    socket: socket as unknown as Socket,
    emitted,
    acknowledgements,
    listeners,
    event: (name: string, value?: unknown) => listeners.get(name)?.(value),
    reset: () => {
      listeners.clear();
      emitted.length = 0;
      acknowledgements.length = 0;
    },
  };
});
afterEach(() => {
  cleanup();
  fake.reset();
  vi.useRealTimers();
});

function setup() {
  const reload = vi.fn().mockResolvedValue(undefined);
  const invalidateSnapshot = vi.fn();
  const onJoinFailure = vi.fn();
  const canApplyRealtime = vi.fn(() => true);
  const onAccessInvalidated = vi.fn();
  const applyTicket = vi.fn();
  const setMessages = vi.fn();
  const result = renderHook(
    ({ ticketId }) =>
      useTicketRealtime({
        ticketId,
        applyTicket,
        setMessages,
        reload,
        invalidateSnapshot,
        onJoinFailure,
        canApplyRealtime,
        onAccessInvalidated,
      }),
    { initialProps: { ticketId: "ticket-1" } },
  );
  return {
    reload,
    invalidateSnapshot,
    onJoinFailure,
    onAccessInvalidated,
    canApplyRealtime,
    setMessages,
    ...result,
  };
}
describe("ticket join and snapshot", () => {
  it("loads a snapshot only after an acknowledged join", async () => {
    const { reload, result } = setup();
    expect(fake.acknowledgements).toHaveLength(1);
    expect(result.current).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    await act(async () => fake.acknowledgements[0](null, { ok: true, visibility: "staff" }));
    expect(result.current).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => fake.event("disconnect"));
    expect(result.current).toBe(false);
  });
  it("ignores a late acknowledgement after switching ticket", async () => {
    const { reload, rerender } = setup();
    rerender({ ticketId: "ticket-2" });
    await act(async () => fake.acknowledgements[0](null, { ok: true, visibility: "staff" }));
    expect(reload).not.toHaveBeenCalled();
    await act(async () => fake.acknowledgements[1](null, { ok: true, visibility: "public" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("reports a rejected join rather than claiming realtime is ready", async () => {
    const { onJoinFailure } = setup();
    await act(async () => fake.acknowledgements[0](null, { ok: false, code: "TICKET_ROOM_LIMIT" }));
    expect(onJoinFailure).toHaveBeenCalled();
  });
  it("rechecks access and attempts to rejoin after the server invalidates this ticket", async () => {
    const { reload, invalidateSnapshot } = setup();
    await act(async () => fake.event("ticket.access.invalidated", { ticketId: "other" }));
    expect(invalidateSnapshot).not.toHaveBeenCalled();
    await act(async () => fake.event("ticket.access.invalidated", { ticketId: "ticket-1" }));
    expect(invalidateSnapshot).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(fake.acknowledgements).toHaveLength(2);
  });

  it("retries a timed out join and ignores its old acknowledgement after reconnect", async () => {
    vi.useFakeTimers();
    const { reload, onJoinFailure } = setup();
    await act(async () => fake.acknowledgements[0](new Error("timeout")));
    expect(onJoinFailure).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(fake.acknowledgements).toHaveLength(2);
    await act(async () => fake.event("disconnect"));
    await act(async () => fake.event("connect"));
    expect(fake.acknowledgements).toHaveLength(3);
    reload.mockClear();
    await act(async () => fake.acknowledgements[1](null, { ok: true }));
    expect(reload).not.toHaveBeenCalled();
    await act(async () => fake.acknowledgements[2](null, { ok: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores delayed messages while access is denied", async () => {
    const { canApplyRealtime, setMessages } = setup();
    canApplyRealtime.mockReturnValue(false);
    await act(async () => fake.event("ticket.message.created", { ticketId: "ticket-1", id: "m1" }));
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("invalidates an in-flight snapshot when a message arrives", async () => {
    const { invalidateSnapshot } = setup();
    await act(async () => fake.event("ticket.message.created", { ticketId: "ticket-1", id: "m1" }));
    expect(invalidateSnapshot).toHaveBeenCalled();
  });
});
