import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  socketHealthOf,
  subscribeSocketHealth,
  type SocketHealth,
} from "@/lib/realtime/socket-health";

/**
 * React binding of `socketHealthOf`: the same value the util reads, kept in
 * sync by the socket's own connect/disconnect events. No store, no context —
 * the socket is the source of truth and this is one subscription per caller.
 */
export function useSocketHealth(socket: Socket | null): SocketHealth {
  const [health, setHealth] = useState<SocketHealth>(() =>
    socketHealthOf(socket),
  );
  useEffect(() => subscribeSocketHealth(socket, setHealth), [socket]);
  return health;
}
