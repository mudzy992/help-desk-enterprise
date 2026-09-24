import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { useSession } from "@/lib/session/use-session";
import {
  applyNotificationCreated,
  applyNotificationRead,
  type NotificationRealtimePayload,
} from "@/lib/realtime/apply-notification-realtime";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { useSocketHealth } from "@/lib/realtime/use-socket-health";
import {
  shouldPollUnreadCount,
  unreadCountFallbackIntervalMs,
} from "@/lib/realtime/socket-health";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
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
 * Phase 1.3 (plan §1.3): the badge is push-driven through the helpdesk socket,
 * so the 30-second poll now only runs as a *fallback* — while the socket is not
 * connected. A healthy connection means zero calls to
 * `GET /notifications/unread-count`; a dropped one means the badge keeps
 * updating exactly as it did before, and it stops polling again the moment the
 * socket comes back (which also triggers an immediate refresh).
 */
export function useInboxNotifications() {
  const { session } = useSession();
  const [items, setItems] = useState<readonly InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketHealth = useSocketHealth(socket);

  const refreshList = useCallback(async () => {
    if (session === null) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    try {
      const response = await listNotifications();
      setItems(response.items);
      setUnreadCount(response.unreadCount);
    } catch {
      setItems([]);
    }
  }, [session]);

  const refreshUnread = useCallback(async () => {
    if (session === null) {
      setUnreadCount(0);
      return;
    }
    try {
      const response = await getNotificationUnreadCount();
      setUnreadCount(response.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, [session]);

  useEffect(() => {
    if (session === null) {
      return;
    }
    // Runs on every health change: a reconnect refreshes at once (the socket
    // may have missed events while it was away) and disarms the timer, while a
    // disconnect arms it.
    void refreshUnread();
    if (!shouldPollUnreadCount(socketHealth)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshUnread();
    }, unreadCountFallbackIntervalMs);
    return () => window.clearInterval(timer);
  }, [refreshUnread, session, socketHealth]);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    // Published to the health hook above, which decides whether the fallback
    // poll has to run.
    setSocket(socket);
    const applyCount = (payload: NotificationRealtimePayload) => {
      setUnreadCount(payload.unreadCount);
    };
    const stopCreated = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationCreated,
      (payload) => {
        setItems((current) => applyNotificationCreated(current, payload));
        applyCount(payload);
      },
    );
    const stopRead = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationRead,
      (payload) => {
        setItems((current) => applyNotificationRead(current, payload));
        applyCount(payload);
      },
    );
    const stopCount = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationUnreadCount,
      applyCount,
    );
    // The count is refreshed by the health effect above on every reconnect, so
    // this handler only has to make sure the visible list is current too.
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

  const markOneRead = useCallback(async (notificationId: string) => {
    const updated = await markNotificationRead(notificationId);
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    await refreshUnread();
  }, [refreshUnread]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  }, []);

  return {
    items,
    unreadCount,
    refreshList,
    markOneRead,
    markAllRead,
  };
}
