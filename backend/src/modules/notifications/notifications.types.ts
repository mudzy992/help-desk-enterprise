import type { NotificationType } from './notifications.constants';

export type NotificationRecord = {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly ticketId: string | null;
  readonly payload: unknown;
  readonly dedupeKey: string;
  readonly createdAt: Date;
};

export type NotificationPayload = {
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly event: string;
  readonly messageId: string;
  readonly actorUserId: string | null;
  readonly confidential: boolean;
};

export type NotificationResponse = {
  readonly id: string;
  readonly type: NotificationType | string;
  readonly title: string;
  readonly body: string | null;
  readonly isRead: boolean;
  readonly readAt: string | null;
  readonly ticketId: string | null;
  readonly payload: NotificationPayload | null;
  readonly createdAt: string;
};

export type NotificationListQuery = {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
};

export type NotificationListResponse = {
  readonly items: readonly NotificationResponse[];
  readonly unreadCount: number;
};

export type NotificationUnreadCountResponse = {
  readonly unreadCount: number;
};
