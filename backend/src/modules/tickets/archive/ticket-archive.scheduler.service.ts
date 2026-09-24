import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  ticketArchiveCompletedJobsToKeep,
  ticketArchiveFailedJobsToKeep,
  ticketArchiveJobAttempts,
  ticketArchiveJobBackoffMilliseconds,
  ticketArchiveJobLabel,
  ticketArchiveJobName,
  ticketArchiveQueueName,
  ticketArchiveSchedulePattern,
  ticketArchiveSchedulerId,
} from './ticket-archive.job.constants';

/**
 * Phase 4.1 (plan §4.1): the schedule lives in Redis and is idempotent by id, so
 * two worker instances converge on exactly one occurrence per slot.
 */
@Injectable()
export class TicketArchiveSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TicketArchiveSchedulerService.name);

  constructor(@InjectQueue(ticketArchiveQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: ticketArchiveSchedulerId,
      jobName: ticketArchiveJobName,
      label: ticketArchiveJobLabel,
      schedule: { kind: 'pattern', pattern: ticketArchiveSchedulePattern },
      attempts: ticketArchiveJobAttempts,
      backoffMilliseconds: ticketArchiveJobBackoffMilliseconds,
      completedJobsToKeep: ticketArchiveCompletedJobsToKeep,
      failedJobsToKeep: ticketArchiveFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
