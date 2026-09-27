import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  inboundEmailPollJobName,
  inboundEmailPollSchedulerId,
  inboundEmailQueueName,
  inboundEmailRetentionCronPattern,
  inboundEmailRetentionJobName,
  inboundEmailRetentionSchedulerId,
  inboundEmailTickMilliseconds,
} from './inbound-email.constants';

/** Idempotent by id: restarts and extra workers converge on one schedule. */
@Injectable()
export class InboundEmailSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(InboundEmailSchedulerService.name);

  constructor(@InjectQueue(inboundEmailQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const opts = { attempts: 1, removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } };
    try {
      await this.queue.upsertJobScheduler(
        inboundEmailPollSchedulerId,
        { every: inboundEmailTickMilliseconds },
        { name: inboundEmailPollJobName, data: {}, opts },
      );
      await this.queue.upsertJobScheduler(
        inboundEmailRetentionSchedulerId,
        { pattern: inboundEmailRetentionCronPattern },
        { name: inboundEmailRetentionJobName, data: {}, opts },
      );
    } catch (error) {
      this.logger.warn(`inbound_email_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
