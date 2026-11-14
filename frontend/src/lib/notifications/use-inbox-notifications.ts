import { useCallback, useEffect, useRef, useState } from "react";
import { useInboxReconnect } from "@/lib/notifications/use-inbox-reconnect";
import { useInboxVisibilityRefresh } from "@/lib/notifications/use-inbox-visibility-refresh";
import {
  appendUniqueNotifications,
  markKnownRead,
  checkNotificationJournal,
  recordNotificationEvent,
  reconcileListEvents,
} from "@/lib/notifications/notification-snapshot-reconcile";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
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

export type UseInboxNotificationsOptions = {
  readonly isListVisible?: boolean;
};

export function useInboxNotifications({
  isListVisible = false,
}: UseInboxNotificationsOptions = {}) {
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
  const unreadRevision = useRef(0);
  const identityEpoch = useRef(0);
  const listEvents = useRef<
    Array<{ kind: "created" | "read"; payload: NotificationRealtimePayload }>
  >([]);
  const [listErrorKey, setListErrorKey] = useState<ApiErrorKey | null>(null);
  const [listRequestId, setListRequestId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketHealth = useSocketHealth(socket);
  const subjectId = session?.principal.subjectId;
  useEffect(() => {
    setItems([]);
    setUnreadCount(0);
    setHasMore(false);
    setNextCursor(null);
    return () => {
      requestSequence.current += 1;
      unreadRevision.current += 1;
      identityEpoch.current += 1;
      isLoadingFirstPageRef.current = false;
      isLoadingMoreRef.current = false;
    };
  }, [subjectId]);
  const loadFirstPage = useCallback(
    async (filterUnreadOnly: boolean) => {
      const requestId = ++requestSequence.current;
      const unreadAtStart = ++unreadRevision.current;
      listEvents.current = [];
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
        if (!checkNotificationJournal(listEvents.current, () => setListErrorKey("errors.server")))
          return;
        setItems(reconcileListEvents(response.items, listEvents.current, filterUnreadOnly));
        if (unreadAtStart === unreadRevision.current) {
          unreadRevision.current += 1;
          setUnreadCount(response.unreadCount);
        }
        setHasMore(response.hasMore);
        setNextCursor(response.nextCursor);
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setListErrorKey(mapApiError(error));
        setListRequestId(readApiRequestId(error));
      } finally {
        if (requestId === requestSequence.current) {
          isLoadingFirstPageRef.current = false;
          listEvents.current = [];
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
    const unreadAtStart = ++unreadRevision.current;
    listEvents.current = [];
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setListErrorKey(null);
    setListRequestId(null);
    try {
      const response = await listNotifications({ unreadOnly, cursor });
      if (requestId !== requestSequence.current) return;
      if (!checkNotificationJournal(listEvents.current, () => setListErrorKey("errors.server")))
        return;
      const events = [...listEvents.current];
      setItems((current) =>
        reconcileListEvents(appendUniqueNotifications(current, response.items), events, unreadOnly),
      );
      if (unreadAtStart === unreadRevision.current) {
        unreadRevision.current += 1;
        setUnreadCount(response.unreadCount);
      }
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setListErrorKey(mapApiError(error));
      setListRequestId(readApiRequestId(error));
    } finally {
      if (requestId === requestSequence.current) {
        isLoadingMoreRef.current = false;
        listEvents.current = [];
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, nextCursor, session, unreadOnly]);
  const refreshUnread = useCallback(async () => {
    if (session === null) {
      setUnreadCount(0);
      return;
    }
    const unreadAtStart = ++unreadRevision.current;
    const response = await getNotificationUnreadCount();
    if (unreadAtStart === unreadRevision.current) {
      unreadRevision.current += 1;
      setUnreadCount(response.unreadCount);
    }
  }, [session]);
  const hasConnectedBefore = useInboxReconnect(
    socketHealth,
    session !== null,
    isListVisible,
    refreshList,
    refreshUnread,
  );
  useVisibilityAwarePolling({
    poll: refreshUnread,
    intervalMs: unreadCountFallbackIntervalMs,
    enabled: session !== null && shouldPollUnreadCount(socketHealth),
    telemetryKey: "notifications.unread_poll_failed",
  });

  useInboxVisibilityRefresh(isListVisible, socketHealth, hasConnectedBefore, refreshList);
  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket();
    setSocket(socket);
    const currentUserId = session.principal.subjectId;
    const applyCount = (payload: NotificationRealtimePayload) => {
      unreadRevision.current += 1;
      setUnreadCount((current) => nextUnreadCount(current, payload));
    };
    const stopCreated = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationCreated,
      (payload) => {
        if (isExcludedGroupEvent(payload, currentUserId)) {
          return;
        }
        if (isLoadingFirstPageRef.current || isLoadingMoreRef.current)
          recordNotificationEvent(listEvents.current, "created", payload);
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
        if (isLoadingFirstPageRef.current || isLoadingMoreRef.current)
          recordNotificationEvent(listEvents.current, "read", payload);
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
    return () => {
      stopCreated();
      stopRead();
      stopCount();
      setSocket(null);
      releaseHelpdeskSocket();
    };
  }, [refreshUnread, session, subjectId]);
  const markOneRead = useCallback(
    async (notificationId: string) => {
      const epoch = identityEpoch.current;
      const updated = await markNotificationRead(notificationId);
      if (epoch !== identityEpoch.current) return;
      const hadPendingListRequest = cancelPendingListRequests();
      setItems((current) =>
        unreadOnlyRef.current
          ? current.filter((item) => item.id !== updated.id)
          : current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await refreshUnread();
      if (epoch === identityEpoch.current && hadPendingListRequest) await refreshList();
    },
    [cancelPendingListRequests, refreshList, refreshUnread],
  );

  const markAllRead = useCallback(async () => {
    const epoch = identityEpoch.current;
    const unreadAtStart = ++unreadRevision.current;
    const idsAtStart = new Set(items.map((item) => item.id));
    const result = await markAllNotificationsRead();
    if (epoch !== identityEpoch.current) return;
    const hadPendingListRequest = cancelPendingListRequests();
    setItems((current) => markKnownRead(current, idsAtStart, unreadOnlyRef.current));
    if (unreadAtStart === unreadRevision.current) {
      unreadRevision.current += 1;
      setUnreadCount(result.unreadCount);
    }
    if (unreadOnlyRef.current) {
      setHasMore(false);
      setNextCursor(null);
    }
    if (hadPendingListRequest) await refreshList();
  }, [cancelPendingListRequests, items, refreshList]);

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
