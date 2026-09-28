import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { privacyCronPattern, privacyJobs, privacyQueueName, privacySchedulerId } from './privacy.constants';

/** Idempotent by id: restarts and extra workers converge on one schedule. */
@Injectable()
export class PrivacySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PrivacySchedulerService.name);

  constructor(@InjectQueue(privacyQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        privacySchedulerId,
        { pattern: privacyCronPattern },
        {
          name: privacyJobs.maintenance,
          data: {},
          opts: { attempts: 1, removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
        },
      );
    } catch (error) {
      this.logger.warn(`privacy_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
