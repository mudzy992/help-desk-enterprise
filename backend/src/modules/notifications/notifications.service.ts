import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { countUnreadNotifications } from './count-unread-notifications';
import { executeNotificationOperation } from './execute-notification-operation';
import { NotificationUnreadCountCache } from './notification-unread-count.cache';
import { listNotifications } from './list-notifications';
import { loadNotificationAudience } from './notification-audience';
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
    private readonly unreadCountCache: NotificationUnreadCountCache,
  ) {}

  list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return executeNotificationOperation(() =>
      listNotifications(this.prisma, userId, query),
    );
  }

  /**
   * Phase 1.3 (plan §1.3): the badge is served from a 15-second Redis entry
   * when there is one. The fan-out and the two read paths write or drop that
   * entry, so the value only ever lags by a moment, and Redis being unavailable
   * just means the count comes from the database (it is never an error).
   */
  unreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    return executeNotificationOperation(async () => {
      // Option A: the badge also depends on the user's groups, so the cached value is
      // checked against their epochs (bumped by every group notification).
      const memberships = await loadNotificationAudience(this.prisma, userId);
      const groupIds = memberships.map((membership) => membership.groupId);
      const cached = await this.unreadCountCache.readWithEpochs(userId, groupIds);
      if (cached.count !== null) {
        return { unreadCount: cached.count };
      }
      const unreadCount = await countUnreadNotifications(this.prisma, userId);
      await this.unreadCountCache.writeWithEpochs(userId, unreadCount, cached.epochs);
      return { unreadCount };
    });
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
      // Marking read is one of the two ways the count can change; drop the
      // cached value instead of writing this one (the next read is cheap and
      // cannot disagree with the database).
      await this.unreadCountCache.invalidate(userId);
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
      await this.unreadCountCache.invalidate(userId);
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
