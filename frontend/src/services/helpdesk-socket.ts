import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

let socket: Socket | null = null;
let referenceCount = 0;
let releaseTimer: number | null = null;

/**
 * Faza 3.1 (plan §3.1): a rolling deploy reconnects every client at once, so the
 * reconnect delay is jittered — without it the second deploy in a row produces a
 * synchronised spike of handshakes and room re-joins.
 */
export const helpdeskSocketReconnect = {
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.5,
} as const;

/**
 * The socket authenticates with the session cookie the browser already holds, so
 * `withCredentials` is the only auth option. The API checks the handshake origin.
 */
export function createHelpdeskSocketOptions(): Partial<ManagerOptions & SocketOptions> {
  return {
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    ...helpdeskSocketReconnect,
  };
}

export function getHelpdeskSocket(): Socket | null {
  return socket;
}

export function acquireHelpdeskSocket(): Socket {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  referenceCount += 1;
  if (socket !== null) {
    return socket;
  }
  socket = io(apiBaseUrl, createHelpdeskSocketOptions());
  return socket;
}

export function releaseHelpdeskSocket(): void {
  referenceCount = Math.max(0, referenceCount - 1);
  if (referenceCount > 0) {
    return;
  }
  releaseTimer = window.setTimeout(() => {
    if (referenceCount === 0) {
      disconnectSocket();
    }
    releaseTimer = null;
  }, 0);
}

function disconnectSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
