import { apiRequest } from "@/services/api";

export type InAppNotificationPayload = {
  readonly ticketId?: string;
  readonly ticketNumber?: string;
  readonly event?: string;
  readonly messageId?: string;
  readonly actorUserId?: string | null;
  readonly confidential?: boolean;
  /** Paket 3.3 (P5): problem notifications carry the problem instead of a ticket. */
  readonly problemId?: string;
  /** Paket 3.4: change notices. */
  readonly changeId?: string;
  readonly problemNumber?: string;
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

export type NotificationListQuery = {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
};

export type NotificationListResponse = {
  readonly items: readonly InAppNotification[];
  readonly unreadCount: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type NotificationUnreadCountResponse = {
  readonly unreadCount: number;
};

export function listNotifications(query: NotificationListQuery = {}) {
  const parameters = new URLSearchParams();
  if (query.unreadOnly === true) parameters.set("unreadOnly", "true");
  if (query.limit !== undefined) parameters.set("limit", String(query.limit));
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  const search = parameters.toString();
  return apiRequest<NotificationListResponse>(
    `/notifications${search.length === 0 ? "" : `?${search}`}`,
  );
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
