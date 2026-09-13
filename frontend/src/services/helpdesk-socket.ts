import { io, type Socket } from "socket.io-client";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

let socket: Socket | null = null;
let token: string | null = null;
let referenceCount = 0;
let releaseTimer: number | null = null;

export function getHelpdeskSocket(): Socket | null {
  return socket;
}

export function acquireHelpdeskSocket(accessToken: string): Socket {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  referenceCount += 1;
  if (socket !== null && token === accessToken) {
    return socket;
  }
  disconnectSocket();
  token = accessToken;
  socket = io(apiBaseUrl, {
    auth: { token: accessToken },
    autoConnect: true,
    reconnection: true,
  });
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
  token = null;
}
