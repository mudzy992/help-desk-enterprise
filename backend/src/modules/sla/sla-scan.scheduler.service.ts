import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  slaScanCompletedJobsToKeep,
  slaScanFailedJobsToKeep,
  slaScanJobAttempts,
  slaScanJobBackoffMilliseconds,
  slaScanJobName,
  slaScanQueueName,
  slaScanRepeatEveryMilliseconds,
  slaScanSchedulerId,
} from './sla-scan.constants';

/**
 * Phase 2.1 (plan §2.1): registers the recurring scan.
 *
 * `upsertJobScheduler` is idempotent by id, so restarts and extra worker
 * instances converge on exactly one schedule; BullMQ itself guarantees that a
 * due job is delivered to a single worker (the "distributed lock" the plan
 * requires), and a cycle that takes longer than its interval simply delays the
 * next one instead of overlapping it.
 */
@Injectable()
export class SlaScanSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SlaScanSchedulerService.name);

  constructor(@InjectQueue(slaScanQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        slaScanSchedulerId,
        { every: slaScanRepeatEveryMilliseconds },
        {
          name: slaScanJobName,
          data: {},
          opts: {
            attempts: slaScanJobAttempts,
            backoff: {
              type: 'exponential',
              delay: slaScanJobBackoffMilliseconds,
            },
            removeOnComplete: { count: slaScanCompletedJobsToKeep },
            removeOnFail: { count: slaScanFailedJobsToKeep },
          },
        },
      );
    } catch (error) {
      // A worker that cannot reach Redis keeps running for the other queues;
      // the next restart (or the next successful boot) registers the schedule.
      this.logger.warn(
        `sla_scan_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
