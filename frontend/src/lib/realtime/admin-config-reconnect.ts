import type { Socket } from "socket.io-client";
import { publishAdminConfigReconnect } from "@/lib/realtime/admin-config-events";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";

/** Notify mounted admin screens after a reconnect, without publishing any server data. */
export function subscribeToAdminConfigReconnect(socket: Socket): () => void {
  let connectedBefore = socket.connected;
  return subscribeSocketEvent(socket, "connect", () => {
    if (connectedBefore) publishAdminConfigReconnect();
    connectedBefore = true;
  });
}
