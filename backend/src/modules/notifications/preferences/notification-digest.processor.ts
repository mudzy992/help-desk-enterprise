import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { notificationDigestQueueName } from './notification-digest.constants';
import { NotificationDigestService } from './notification-digest.service';

@Processor(notificationDigestQueueName)
export class NotificationDigestProcessor extends WorkerHost {
  private readonly logger = new Logger('NotificationDigest');

  constructor(private readonly digestService: NotificationDigestService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    const result = await this.digestService.runDue();
    if (result.usersWithItems > 0) {
      this.logger.log(
        `notification_digest_users=${result.usersWithItems} notification_digest_sent_total=${result.emailsSent} notification_digest_items_delivered=${result.itemsDelivered} notification_digest_items_dropped=${result.itemsDropped} notification_digest_failures=${result.failures} notification_digest_duration_ms=${Date.now() - startedAt}`,
      );
    }
  }
}
