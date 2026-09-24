import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { notificationRetentionQueueName } from './notification-retention.constants';
import { NotificationRetentionProcessor } from './notification-retention.processor';
import { NotificationRetentionSchedulerService } from './notification-retention.scheduler.service';

/** Phase 2.3: the retention sweep, owned by the worker process (plan §4.1). */
@Module({
  imports: [BullModule.registerQueue({ name: notificationRetentionQueueName })],
  providers: [NotificationRetentionProcessor, NotificationRetentionSchedulerService],
})
export class NotificationRetentionWorkerModule {}
