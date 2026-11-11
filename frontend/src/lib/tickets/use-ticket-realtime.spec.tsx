// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { useTicketRealtime } from "@/lib/tickets/use-ticket-realtime";

const sessionState = vi.hoisted(() => ({
  session: { principal: { subjectId: "user-1" } },
}));

vi.mock("@/lib/session/use-session", () => ({ useSession: () => sessionState }));
vi.mock("@/services/helpdesk-socket", () => ({
  acquireHelpdeskSocket: () => socketMock.socket,
  releaseHelpdeskSocket: vi.fn(),
}));

const socketMock = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
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
  };
  return {
    socket: socket as unknown as Socket,
    emitted,
    emitToClient: (event: string, payload?: unknown) => listeners.get(event)?.(payload),
    reset: () => {
      listeners.clear();
      emitted.length = 0;
    },
  };
});

afterEach(() => {
  cleanup();
  socketMock.reset();
});

describe("useTicketRealtime reconnect catch-up", () => {
  it("rejoins the ticket room and reloads the REST snapshot on reconnect", () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const applyTicket = vi.fn();
    const setMessages = vi.fn();
    renderHook(() =>
      useTicketRealtime({
        ticketId: "ticket-1",
        applyTicket,
        setMessages,
        reload,
      }),
    );

    expect(socketMock.emitted).toContainEqual({
      event: "ticket:join",
      payload: { ticketId: "ticket-1" },
    });
    expect(reload).not.toHaveBeenCalled();

    act(() => socketMock.emitToClient("connect"));

    expect(socketMock.emitted.filter((event) => event.event === "ticket:join")).toHaveLength(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
