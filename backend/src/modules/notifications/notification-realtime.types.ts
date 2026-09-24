import type { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { NotificationResponse } from './notifications.types';

export type NotificationRealtimeEventName =
  | typeof ticketRealtimeEventNames.notificationCreated
  | typeof ticketRealtimeEventNames.notificationRead
  | typeof ticketRealtimeEventNames.notificationUnreadCount;

export type NotificationRealtimePublish = {
  readonly userId: string;
  readonly eventName: NotificationRealtimeEventName;
  readonly notification: NotificationResponse | null;
  readonly unreadCount: number;
  readonly readAll?: boolean;
};

/**
 * Option A: one `notification.created` into the group room for a group row. There is
 * no per-user badge in it (the room is shared), so the client adds `unreadDelta` to
 * its own count and ignores the event when it is listed in `excludedUserIds`.
 */
export type GroupNotificationRealtimePublish = {
  readonly groupId: string;
  readonly notification: NotificationResponse;
  readonly excludedUserIds: readonly string[];
};

export type GroupNotificationRealtimeClientPayload = {
  readonly eventId: string;
  readonly createdAt: string;
  readonly notification: NotificationResponse;
  readonly unreadDelta: 1;
  readonly excludedUserIds: readonly string[];
  readonly groupId: string;
  readonly readAll: false;
  readonly occurredAt: string;
};

export type NotificationRealtimeClientPayload = {
  readonly eventId: string;
  readonly createdAt: string;
  readonly notification: NotificationResponse | null;
  readonly unreadCount: number;
  readonly readAll: boolean;
  readonly occurredAt: string;
};
