import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
import { reportClientError } from "@/lib/app/client-logger";
import type { Socket } from "socket.io-client";
import { useSession } from "@/lib/session/use-session";
import {
  applyNotificationCreated,
  applyNotificationRead,
  type NotificationRealtimePayload,
  isExcludedGroupEvent,
  nextUnreadCount,
} from "@/lib/realtime/apply-notification-realtime";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { useSocketHealth } from "@/lib/realtime/use-socket-health";
import { shouldPollUnreadCount, unreadCountFallbackIntervalMs } from "@/lib/realtime/socket-health";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from "@/services/notifications-api";

/**
 * Inbox notifications.
 *
 * The badge is push-driven through the helpdesk socket, so the 30-second poll
 * only runs as a fallback while the socket is not connected. Inbox pages use a
 * stable server cursor; the in-memory list contains only pages the user opened.
 */
export function useInboxNotifications() {
  const { session } = useSession();
  const [items, setItems] = useState<readonly InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnlyState] = useState(false);
  const unreadOnlyRef = useRef(unreadOnly);
  unreadOnlyRef.current = unreadOnly;
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const isLoadingFirstPageRef = useRef(false);
  const requestSequence = useRef(0);
  // A failing read must not look like "no activity" — keep prior items and
  // expose the error/request ID so the UI can offer a retry.
  const [listErrorKey, setListErrorKey] = useState<ApiErrorKey | null>(null);
  const [listRequestId, setListRequestId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketHealth = useSocketHealth(socket);

  const loadFirstPage = useCallback(
    async (filterUnreadOnly: boolean) => {
      const requestId = ++requestSequence.current;
      isLoadingFirstPageRef.current = true;
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      setHasMore(false);
      setNextCursor(null);
      setListErrorKey(null);
      setListRequestId(null);
      if (session === null) {
        setItems([]);
        setUnreadCount(0);
        isLoadingFirstPageRef.current = false;
        return;
      }
      try {
        const response = await listNotifications({ unreadOnly: filterUnreadOnly });
        if (requestId !== requestSequence.current) return;
        setItems(response.items);
        setUnreadCount(response.unreadCount);
        setHasMore(response.hasMore);
        setNextCursor(response.nextCursor);
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setListErrorKey(mapApiError(error));
        setListRequestId(readApiRequestId(error));
      } finally {
        if (requestId === requestSequence.current) {
          isLoadingFirstPageRef.current = false;
        }
      }
    },
    [session],
  );

  const refreshList = useCallback(() => loadFirstPage(unreadOnly), [loadFirstPage, unreadOnly]);
  const cancelPendingListRequests = useCallback(() => {
    const wasPending = isLoadingFirstPageRef.current || isLoadingMoreRef.current;
    if (!wasPending) return false;
    requestSequence.current += 1;
    isLoadingFirstPageRef.current = false;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    return true;
  }, []);

  const setUnreadOnly = useCallback(
    (next: boolean) => {
      if (next === unreadOnlyRef.current) return;
      unreadOnlyRef.current = next;
      setUnreadOnlyState(next);
      setItems([]);
      setHasMore(false);
      setNextCursor(null);
      void loadFirstPage(next);
    },
    [loadFirstPage],
  );

  const loadMore = useCallback(async () => {
    const cursor = nextCursor;
    if (
      session === null ||
      cursor === null ||
      !hasMore ||
      isLoadingMoreRef.current ||
      isLoadingFirstPageRef.current
    ) {
      return;
    }
    const requestId = ++requestSequence.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setListErrorKey(null);
    setListRequestId(null);
    try {
      const response = await listNotifications({ unreadOnly, cursor });
      if (requestId !== requestSequence.current) return;
      setItems((current) => appendUniqueNotifications(current, response.items));
      setUnreadCount(response.unreadCount);
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setListErrorKey(mapApiError(error));
      setListRequestId(readApiRequestId(error));
    } finally {
      if (requestId === requestSequence.current) {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, nextCursor, session, unreadOnly]);

  const refreshUnread = useCallback(async () => {
    if (session === null) {
      setUnreadCount(0);
      return;
    }
    const response = await getNotificationUnreadCount();
    setUnreadCount(response.unreadCount);
  }, [session]);

  const previousSocketHealth = useRef(socketHealth);
  useVisibilityAwarePolling({
    poll: refreshUnread,
    intervalMs: unreadCountFallbackIntervalMs,
    enabled: session !== null && shouldPollUnreadCount(socketHealth),
    telemetryKey: "notifications.unread_poll_failed",
  });

  useEffect(() => {
    const reconnected =
      previousSocketHealth.current !== "connected" && socketHealth === "connected";
    previousSocketHealth.current = socketHealth;
    if (!reconnected || session === null) return;
    void refreshUnread().catch((error) =>
      reportClientError("notifications.unread_reconnect_failed", error, readApiRequestId(error)),
    );
  }, [refreshUnread, session, socketHealth]);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket();
    // The socket health hook uses this reference to decide whether the fallback
    // badge poll has to run.
    setSocket(socket);
    const currentUserId = session.principal.subjectId;
    const applyCount = (payload: NotificationRealtimePayload) => {
      setUnreadCount((current) => nextUnreadCount(current, payload));
    };
    const stopCreated = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationCreated,
      (payload) => {
        if (isExcludedGroupEvent(payload, currentUserId)) {
          return;
        }
        setItems((current) => {
          const updated = applyNotificationCreated(current, payload);
          return unreadOnlyRef.current ? updated.filter((item) => !item.isRead) : updated;
        });
        applyCount(payload);
      },
    );
    const stopRead = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationRead,
      (payload) => {
        setItems((current) => {
          const updated = applyNotificationRead(current, payload);
          return unreadOnlyRef.current ? updated.filter((item) => !item.isRead) : updated;
        });
        applyCount(payload);
      },
    );
    const stopCount = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationUnreadCount,
      applyCount,
    );
    const stopConnect = subscribeSocketEvent(socket, "connect", () => {
      void refreshUnread();
    });
    return () => {
      stopCreated();
      stopRead();
      stopCount();
      stopConnect();
      setSocket(null);
      releaseHelpdeskSocket();
    };
  }, [refreshUnread, session]);

  const markOneRead = useCallback(
    async (notificationId: string) => {
      const updated = await markNotificationRead(notificationId);
      const hadPendingListRequest = cancelPendingListRequests();
      setItems((current) =>
        unreadOnlyRef.current
          ? current.filter((item) => item.id !== updated.id)
          : current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await refreshUnread();
      if (hadPendingListRequest) await refreshList();
    },
    [cancelPendingListRequests, refreshList, refreshUnread],
  );

  const markAllRead = useCallback(async () => {
    const result = await markAllNotificationsRead();
    const hadPendingListRequest = cancelPendingListRequests();
    setItems((current) =>
      unreadOnlyRef.current ? [] : current.map((item) => ({ ...item, isRead: true })),
    );
    setUnreadCount(result.unreadCount);
    if (unreadOnlyRef.current) {
      setHasMore(false);
      setNextCursor(null);
    }
    if (hadPendingListRequest) await refreshList();
  }, [cancelPendingListRequests, refreshList]);

  return {
    items,
    unreadCount,
    unreadOnly,
    setUnreadOnly,
    hasMore,
    isLoadingMore,
    listErrorKey,
    listRequestId,
    refreshList,
    loadMore,
    markOneRead,
    markAllRead,
  };
}

function appendUniqueNotifications(
  current: readonly InAppNotification[],
  incoming: readonly InAppNotification[],
): InAppNotification[] {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}
