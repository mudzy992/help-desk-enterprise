import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import type { Socket } from "socket.io-client";

type QueryKey = readonly unknown[];

/** Active REST snapshots reconciled after a WebSocket reconnect. */
const reconnectCatchupQueryKeys: readonly QueryKey[] = [
  queryKeys.ticketLists,
  queryKeys.ticketCountsPrefix,
  queryKeys.groupInbox,
  queryKeys.dashboardSummaryPrefix,
  queryKeys.slaSummary,
  queryKeys.notifications,
];

export function queryKeysForRealtimeReconnectCatchup(): readonly QueryKey[] {
  return reconnectCatchupQueryKeys;
}

export type RealtimeReconnectCatchupOptions = {
  readonly socket: Socket;
  readonly queryClient: QueryClient;
  readonly isScreenVisible?: () => boolean;
};

/**
 * Socket events are best-effort, not a durable replay stream. On reconnect,
 * refetch active ticket/notification projections from their REST snapshots.
 */
export function subscribeToRealtimeReconnectCatchup(
  options: RealtimeReconnectCatchupOptions,
): () => void {
  const isScreenVisible =
    options.isScreenVisible ??
    (() => typeof document === "undefined" || document.visibilityState === "visible");
  let hasConnected = options.socket.connected;
  let pendingCatchup = false;

  const runCatchup = (): void => {
    if (!options.socket.connected || !isScreenVisible()) {
      pendingCatchup = true;
      return;
    }
    pendingCatchup = false;
    for (const queryKey of reconnectCatchupQueryKeys) {
      void options.queryClient.invalidateQueries({
        queryKey,
        refetchType: "active",
      });
    }
  };

  const stopConnect = subscribeSocketEvent(options.socket, "connect", () => {
    if (hasConnected) {
      runCatchup();
    }
    hasConnected = true;
  });
  const onVisibilityChange = () => {
    if (pendingCatchup) runCatchup();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    stopConnect();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
