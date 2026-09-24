import { describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import {
  shouldPollUnreadCount,
  socketHealthOf,
  subscribeSocketHealth,
  unreadCountFallbackIntervalMs,
  type SocketHealth,
} from "@/lib/realtime/socket-health";

/** The two socket.io members this feature touches, plus the event bus. */
function createFakeSocket(connected = true) {
  const listeners = new Map<string, Set<() => void>>();
  const fake = {
    connected,
    on(event: string, handler: () => void) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(handler);
      listeners.set(event, bucket);
      return fake;
    },
    off(event: string, handler: () => void) {
      listeners.get(event)?.delete(handler);
      return fake;
    },
    emitToClient(event: string) {
      for (const handler of listeners.get(event) ?? []) {
        handler();
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
  return fake;
}

describe("socket health", () => {
  it('treats a missing or disconnected socket as "not healthy"', () => {
    expect(socketHealthOf(null)).toBe("disconnected");
    expect(socketHealthOf(createFakeSocket(false) as unknown as Socket)).toBe(
      "disconnected",
    );
    expect(socketHealthOf(createFakeSocket(true) as unknown as Socket)).toBe(
      "connected",
    );
  });

  it('turns polling on only while the socket is down', () => {
    expect(shouldPollUnreadCount("connected")).toBe(false);
    expect(shouldPollUnreadCount("disconnected")).toBe(true);
    // The fallback keeps the old cadence, so a dropped socket behaves as before.
    expect(unreadCountFallbackIntervalMs).toBe(30_000);
  });

  it("reports the current state immediately, then follows connect and disconnect", () => {
    const socket = createFakeSocket(true);
    const seen: SocketHealth[] = [];
    const unsubscribe = subscribeSocketHealth(
      socket as unknown as Socket,
      (health) => seen.push(health),
    );
    expect(seen).toEqual(["connected"]);

    // Socket.io turns the flag before it fires the event.
    socket.connected = false;
    socket.emitToClient("disconnect");
    expect(seen).toEqual(["connected", "disconnected"]);
    expect(shouldPollUnreadCount(seen.at(-1) as SocketHealth)).toBe(true);

    socket.connected = true;
    socket.emitToClient("connect");
    expect(seen).toEqual(["connected", "disconnected", "connected"]);
    expect(shouldPollUnreadCount(seen.at(-1) as SocketHealth)).toBe(false);

    unsubscribe();
    socket.emitToClient("disconnect");
    expect(seen).toHaveLength(3);
    expect(socket.listenerCount("connect")).toBe(0);
    expect(socket.listenerCount("disconnect")).toBe(0);
  });

  it("answers with a disconnected state and never subscribes without a socket", () => {
    const seen: SocketHealth[] = [];
    const unsubscribe = subscribeSocketHealth(null, (health) => seen.push(health));
    expect(seen).toEqual(["disconnected"]);
    expect(() => unsubscribe()).not.toThrow();
  });
});
