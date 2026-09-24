import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import {
  knowledgeBaseReviewReminderCompletedJobsToKeep,
  knowledgeBaseReviewReminderFailedJobsToKeep,
  knowledgeBaseReviewReminderJobAttempts,
  knowledgeBaseReviewReminderJobBackoffMilliseconds,
  knowledgeBaseReviewReminderJobLabel,
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderQueueName,
  knowledgeBaseReviewReminderSchedulePattern,
  knowledgeBaseReviewReminderSchedulerId,
} from './knowledge-base-review-reminder.job.constants';

/**
 * Phase 4.1 (plan §4.1): the schedule lives in Redis and is idempotent by id, so
 * two worker instances converge on exactly one occurrence per slot.
 */
@Injectable()
export class KnowledgeBaseReviewReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseReviewReminderSchedulerService.name);

  constructor(@InjectQueue(knowledgeBaseReviewReminderQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: knowledgeBaseReviewReminderSchedulerId,
      jobName: knowledgeBaseReviewReminderJobName,
      label: knowledgeBaseReviewReminderJobLabel,
      schedule: { kind: 'pattern', pattern: knowledgeBaseReviewReminderSchedulePattern },
      attempts: knowledgeBaseReviewReminderJobAttempts,
      backoffMilliseconds: knowledgeBaseReviewReminderJobBackoffMilliseconds,
      completedJobsToKeep: knowledgeBaseReviewReminderCompletedJobsToKeep,
      failedJobsToKeep: knowledgeBaseReviewReminderFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
