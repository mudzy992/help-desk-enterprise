import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  notificationDigestCronPattern,
  notificationDigestJobName,
  notificationDigestQueueName,
  notificationDigestSchedulerId,
} from './notification-digest.constants';

/** Idempotent by id: restarts and extra workers converge on one schedule. */
@Injectable()
export class NotificationDigestSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDigestSchedulerService.name);

  constructor(@InjectQueue(notificationDigestQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        notificationDigestSchedulerId,
        { pattern: notificationDigestCronPattern },
        {
          name: notificationDigestJobName,
          data: {},
          opts: { attempts: 1, removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
        },
      );
    } catch (error) {
      this.logger.warn(
        `notification_digest_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
