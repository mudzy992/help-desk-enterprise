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

export type NotificationRealtimeClientPayload = {
  readonly notification: NotificationResponse | null;
  readonly unreadCount: number;
  readonly readAll: boolean;
  readonly occurredAt: string;
};
