import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
    return executeNotificationOperation(() =>
      markNotificationRead(this.prisma, userId, notificationId),
    );
  }

  markAllRead(userId: string): Promise<NotificationUnreadCountResponse> {
    return executeNotificationOperation(() =>
      markAllNotificationsRead(this.prisma, userId),
    );
  }
}
