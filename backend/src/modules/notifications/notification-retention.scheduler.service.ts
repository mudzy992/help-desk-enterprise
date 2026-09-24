import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  notificationRetentionCronPattern,
  notificationRetentionJobAttempts,
  notificationRetentionJobBackoffMilliseconds,
  notificationRetentionJobName,
  notificationRetentionQueueName,
  notificationRetentionSchedulerId,
} from './notification-retention.constants';

/**
 * Registers the daily retention sweep. `upsertJobScheduler` is idempotent by id,
 * so restarts and extra worker instances converge on one schedule, and BullMQ
 * hands a due job to a single worker.
 */
@Injectable()
export class NotificationRetentionSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationRetentionSchedulerService.name);

  constructor(
    @InjectQueue(notificationRetentionQueueName) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        notificationRetentionSchedulerId,
        { pattern: notificationRetentionCronPattern },
        {
          name: notificationRetentionJobName,
          data: {},
          opts: {
            attempts: notificationRetentionJobAttempts,
            backoff: {
              type: 'exponential',
              delay: notificationRetentionJobBackoffMilliseconds,
            },
            removeOnComplete: { count: 5 },
            removeOnFail: { count: 20 },
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `notification_retention_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
