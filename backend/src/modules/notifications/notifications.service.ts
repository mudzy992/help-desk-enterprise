import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { countUnreadNotifications } from './count-unread-notifications';
import { executeNotificationOperation } from './execute-notification-operation';
import { listNotifications } from './list-notifications';
import { markAllNotificationsRead } from './mark-all-notifications-read';
import { markNotificationRead } from './mark-notification-read';
import type {
  NotificationListQuery,
  NotificationListResponse,
  NotificationResponse,
  NotificationUnreadCountResponse,
} from './notifications.types';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
  ) {}

  list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return executeNotificationOperation(() =>
      listNotifications(this.prisma, userId, query),
    );
  }

  unreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    return executeNotificationOperation(async () => ({
      unreadCount: await countUnreadNotifications(this.prisma, userId),
    }));
  }

  markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponse> {
    return executeNotificationOperation(async () => {
      const updated = await markNotificationRead(
        this.prisma,
        userId,
        notificationId,
      );
      const unreadCount = await countUnreadNotifications(this.prisma, userId);
      this.ticketRealtimeHub.publishNotification({
        userId,
        eventName: ticketRealtimeEventNames.notificationRead,
        notification: updated,
        unreadCount,
      });
      this.ticketRealtimeHub.publishNotification({
        userId,
        eventName: ticketRealtimeEventNames.notificationUnreadCount,
        notification: null,
        unreadCount,
      });
      return updated;
    });
  }

  markAllRead(userId: string): Promise<NotificationUnreadCountResponse> {
    return executeNotificationOperation(async () => {
      const result = await markAllNotificationsRead(this.prisma, userId);
      this.ticketRealtimeHub.publishNotification({
        userId,
        eventName: ticketRealtimeEventNames.notificationRead,
        notification: null,
        unreadCount: result.unreadCount,
        readAll: true,
      });
      this.ticketRealtimeHub.publishNotification({
        userId,
        eventName: ticketRealtimeEventNames.notificationUnreadCount,
        notification: null,
        unreadCount: result.unreadCount,
      });
      return result;
    });
  }
}
