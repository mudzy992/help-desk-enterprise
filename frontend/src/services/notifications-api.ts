import { apiRequest } from "@/services/api";

export type InAppNotificationPayload = {
  readonly ticketId?: string;
  readonly ticketNumber?: string;
  readonly event?: string;
  readonly messageId?: string;
  readonly actorUserId?: string | null;
  readonly confidential?: boolean;
};

export type InAppNotification = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly isRead: boolean;
  readonly readAt: string | null;
  readonly ticketId: string | null;
  readonly payload: InAppNotificationPayload | null;
  readonly createdAt: string;
};

export type NotificationListResponse = {
  readonly items: readonly InAppNotification[];
  readonly unreadCount: number;
};

export type NotificationUnreadCountResponse = {
  readonly unreadCount: number;
};

export function listNotifications(unreadOnly = false) {
  const query = unreadOnly ? "?unreadOnly=true" : "";
  return apiRequest<NotificationListResponse>(`/notifications${query}`);
}

export function getNotificationUnreadCount() {
  return apiRequest<NotificationUnreadCountResponse>("/notifications/unread-count");
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<InAppNotification>(`/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead() {
  return apiRequest<NotificationUnreadCountResponse>("/notifications/read-all", {
    method: "POST",
  });
}
