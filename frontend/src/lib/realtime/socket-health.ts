import type { Socket } from "socket.io-client";

/** Whether the singleton helpdesk socket can deliver events right now. */
export type SocketHealth = "connected" | "disconnected";

/**
 * Fallback poll cadence (phase 1.3, plan §1.3).
 *
 * This is the old 30-second interval, kept exactly as it was — but it is now
 * only armed while the socket is down. With a healthy connection the badge is
 * push-driven, so the interval costs nothing.
 */
export const unreadCountFallbackIntervalMs = 30_000;

/**
 * Health of the connection.
 *
 * A socket that does not exist yet (nobody acquired it, or it was released) is
 * *not* healthy: the caller has to poll until it is. This is deliberately a
 * plain read of `socket.connected` rather than a new piece of state — the
 * connection already tracks itself, the app only needs to ask it.
 */
export function socketHealthOf(socket: Socket | null): SocketHealth {
  return socket !== null && socket.connected ? "connected" : "disconnected";
}

/**
 * Notifies the listener on every connect/disconnect, and once immediately with
 * the current state so a caller never has to special-case the first read.
 */
export function subscribeSocketHealth(
  socket: Socket | null,
  listener: (health: SocketHealth) => void,
): () => void {
  if (socket === null) {
    listener("disconnected");
    return () => {};
  }
  const onConnect = () => listener("connected");
  const onDisconnect = () => listener("disconnected");
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  listener(socketHealthOf(socket));
  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
  };
}

/** The polling decision, in one place so it can be read from a test. */
export function shouldPollUnreadCount(health: SocketHealth): boolean {
  return health === "disconnected";
}
