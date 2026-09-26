import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  notificationRetentionQueueName,
  resolveNotificationRetentionDays,
} from './notification-retention.constants';
import { purgeExpiredNotifications } from './purge-expired-notifications';
import { notificationDigestItemRetentionDays } from './preferences/notification-digest.constants';

export const notificationRetentionLogContext = 'NotificationRetention';

/**
 * Phase 2.3 (plan §2.3, item 2): the retention sweep runs in the worker, next to
 * the other scheduled jobs (§4.1), so no API request ever waits for it.
 */
@Processor(notificationRetentionQueueName)
export class NotificationRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(notificationRetentionLogContext);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    const retentionDays = resolveNotificationRetentionDays();
    const deleted = await purgeExpiredNotifications(this.prisma, {
      retentionDays,
    });
    // Paket 2.2 (N11): held digest items that could not be sent within 7 days.
    const digestCutoff = new Date(Date.now() - notificationDigestItemRetentionDays * 86_400_000);
    const digestDropped = await this.prisma.notificationDigestItem
      ?.deleteMany({ where: { createdAt: { lt: digestCutoff } } })
      .then((result) => result.count)
      .catch(() => 0);
    this.logger.log(
      `notification_digest_items_expired=${digestDropped ?? 0} notification_retention_deleted=${deleted} notification_retention_days=${retentionDays} notification_retention_duration_ms=${Date.now() - startedAt}`,
    );
  }
}
