import type { Socket } from "socket.io-client";
import { expect, it, vi } from "vitest";
import { subscribeAdminConfigReconnect } from "@/lib/realtime/admin-config-events";
import { subscribeToAdminConfigReconnect } from "@/lib/realtime/admin-config-reconnect";

it("notifies on reconnect, not first connection, and removes its listener", () => {
  let handler: (() => void) | undefined;
  const socket = {
    connected: false,
    on: vi.fn((_event, callback) => {
      handler = callback;
    }),
    off: vi.fn(),
  } as unknown as Socket;
  const listener = vi.fn();
  const stopNotice = subscribeAdminConfigReconnect(listener);
  const stopSocket = subscribeToAdminConfigReconnect(socket);
  handler?.();
  expect(listener).not.toHaveBeenCalled();
  handler?.();
  expect(listener).toHaveBeenCalledTimes(1);
  stopSocket();
  stopNotice();
  expect(socket.off).toHaveBeenCalledWith("connect", handler);
});
