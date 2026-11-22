import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import { isSchedulerRegistered } from '../../common/scheduled-jobs/job-scheduler-presence';
import {
  knowledgeBaseReviewReminderCompletedJobsToKeep,
  knowledgeBaseReviewReminderFailedJobsToKeep,
  knowledgeBaseReviewReminderJobAttempts,
  knowledgeBaseReviewReminderJobBackoffMilliseconds,
  knowledgeBaseReviewReminderJobLabel,
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderQueueName,
  knowledgeBaseReviewReminderReconcileMilliseconds,
  knowledgeBaseReviewReminderSchedulePattern,
  knowledgeBaseReviewReminderSchedulerId,
} from './knowledge-base-review-reminder.job.constants';

/**
 * Phase 4.1 (plan §4.1): the schedule lives in Redis and is idempotent by id, so
 * two worker instances converge on exactly one occurrence per slot.
 *
 * W7.86 (`BA-knowledge-base-13`): the registration used to be write-once-at-boot.
 * A Redis restart, a flush or a failover to an empty instance deleted it and
 * nothing noticed: the review reminders stopped and — because the view flush rides
 * the same job — the Redis view counters kept growing toward their 8-day TTL, so
 * the loss of a *schedule* turned into lost analytics data. The worker now
 * re-asserts its own schedule every minute (the announcement and problem sweeps do
 * the same), and `scheduler.late` watches it as an expected scheduler, so a loss
 * that survives the reconcile is loud instead of silent.
 */
@Injectable()
export class KnowledgeBaseReviewReminderSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KnowledgeBaseReviewReminderSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(knowledgeBaseReviewReminderQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.registerSchedule();
    if (this.reconcileTimer === null) {
      this.reconcileTimer = setInterval(() => {
        void this.reconcileSchedule().catch((error: unknown) => {
          // A reconcile that cannot reach Redis must not take the worker down; the
          // next tick tries again and `scheduler.late` reports the missing schedule.
          this.logger.error(
            `kb_review_reminder_schedule_reconcile_failed type=${
              error instanceof Error ? error.name : 'UnknownError'
            }`,
          );
        });
      }, knowledgeBaseReviewReminderReconcileMilliseconds);
      // The worker has its own keep-alive; this timer must never hold it open (nor
      // keep a jest worker alive after the spec that started the scheduler).
      this.reconcileTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler when Redis lost it; returns restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = await this.queue.getJobSchedulers(0, -1);
    if (isSchedulerRegistered(existing, knowledgeBaseReviewReminderSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(
      `kb_review_reminder_schedule_recovered id=${knowledgeBaseReviewReminderSchedulerId}`,
    );
    return [knowledgeBaseReviewReminderSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
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
