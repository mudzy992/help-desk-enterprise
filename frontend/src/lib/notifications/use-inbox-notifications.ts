import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session/use-session";
import {
  applyNotificationCreated,
  applyNotificationRead,
  type NotificationRealtimePayload,
} from "@/lib/realtime/apply-notification-realtime";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from "@/services/notifications-api";

const refreshIntervalMs = 30_000;

export function useInboxNotifications() {
  const { session } = useSession();
  const [items, setItems] = useState<readonly InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
    void refreshUnread();
    const timer = window.setInterval(() => {
      void refreshUnread();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [refreshUnread]);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
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
    const stopConnect = subscribeSocketEvent(socket, "connect", () => {
      void refreshUnread();
    });
    return () => {
      stopCreated();
      stopRead();
      stopCount();
      stopConnect();
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
