// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query/query-keys";
import {
  queryKeysForRealtimeReconnectCatchup,
  subscribeToRealtimeReconnectCatchup,
} from "@/lib/realtime/reconnect-catchup";
import type { Socket } from "socket.io-client";

type Listener = (...args: unknown[]) => void;

function createSocket(initiallyConnected = false) {
  const listeners = new Map<string, Listener>();
  const socket = {
    connected: initiallyConnected,
    on: (event: string, listener: Listener) => {
      listeners.set(event, listener);
      return socket;
    },
    off: (event: string) => {
      listeners.delete(event);
      return socket;
    },
  } as unknown as Socket & { connected: boolean };
  return {
    socket,
    emitToClient: (event: string) => listeners.get(event)?.(),
    listenerCount: (event: string) => Number(listeners.has(event)),
  };
}

function createQueryClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  return {
    queryClient: { invalidateQueries } as unknown as QueryClient,
    invalidateQueries,
  };
}

const expectedCatchupKeys = [
  queryKeys.ticketLists,
  queryKeys.ticketCountsPrefix,
  queryKeys.groupInbox,
  queryKeys.dashboardSummaryPrefix,
  queryKeys.slaSummary,
  queryKeys.notifications,
];

describe("realtime reconnect catch-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defines REST snapshot keys for ticket and notification state", () => {
    expect(queryKeysForRealtimeReconnectCatchup()).toEqual(expectedCatchupKeys);
  });

  it("invalidates active REST projections after a reconnect, not first connect", () => {
    const { socket, emitToClient } = createSocket();
    const { queryClient, invalidateQueries } = createQueryClient();
    const stop = subscribeToRealtimeReconnectCatchup({ socket, queryClient });

    socket.connected = true;
    emitToClient("connect");
    expect(invalidateQueries).not.toHaveBeenCalled();

    socket.connected = false;
    emitToClient("disconnect");
    socket.connected = true;
    emitToClient("connect");

    expect(invalidateQueries.mock.calls).toEqual(
      expectedCatchupKeys.map((queryKey) => [{ queryKey, refetchType: "active" }]),
    );
    stop();
  });

  it("defers hidden-tab catch-up until the socket and screen are available", () => {
    let visible = false;
    const { socket, emitToClient } = createSocket(true);
    const { queryClient, invalidateQueries } = createQueryClient();
    const stop = subscribeToRealtimeReconnectCatchup({
      socket,
      queryClient,
      isScreenVisible: () => visible,
    });

    socket.connected = false;
    emitToClient("disconnect");
    socket.connected = true;
    emitToClient("connect");
    expect(invalidateQueries).not.toHaveBeenCalled();

    visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(invalidateQueries).toHaveBeenCalledTimes(expectedCatchupKeys.length);
    stop();
  });

  it("removes its connect and visibility listeners on cleanup", () => {
    const { socket, listenerCount } = createSocket(true);
    const { queryClient } = createQueryClient();
    const stop = subscribeToRealtimeReconnectCatchup({ socket, queryClient });
    expect(listenerCount("connect")).toBe(1);

    stop();

    expect(listenerCount("connect")).toBe(0);
  });
});
