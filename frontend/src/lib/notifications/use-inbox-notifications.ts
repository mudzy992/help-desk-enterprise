import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session/use-session";
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
