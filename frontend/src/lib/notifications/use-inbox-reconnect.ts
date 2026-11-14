import { useEffect, useRef } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { readApiRequestId } from "@/lib/map-api-error";
import { isDocumentVisible } from "@/lib/notifications/notification-snapshot-reconcile";
import type { SocketHealth } from "@/lib/realtime/socket-health";

export function useInboxReconnect(
  health: SocketHealth,
  authenticated: boolean,
  listVisible: boolean,
  refreshList: () => Promise<void>,
  refreshUnread: () => Promise<void>,
) {
  const previous = useRef(health);
  const hasConnectedBefore = useRef(health === "connected");
  useEffect(() => {
    const reconnected = previous.current !== "connected" && health === "connected";
    previous.current = health;
    if (!reconnected || !authenticated) return;
    const hadConnectedBefore = hasConnectedBefore.current;
    hasConnectedBefore.current = true;
    void refreshUnread().catch((error) =>
      reportClientError("notifications.unread_reconnect_failed", error, readApiRequestId(error)),
    );
    if (hadConnectedBefore && listVisible && isDocumentVisible()) void refreshList();
  }, [authenticated, health, listVisible, refreshList, refreshUnread]);
  return hasConnectedBefore;
}
