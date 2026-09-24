import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { KnowledgeBaseReviewReminderService } from './knowledge-base-review-reminder.service';
import { KnowledgeBaseReviewReminderProcessor } from './knowledge-base-review-reminder.processor';
import { KnowledgeBaseReviewReminderSchedulerService } from './knowledge-base-review-reminder.scheduler.service';
import { knowledgeBaseReviewReminderQueueName } from './knowledge-base-review-reminder.job.constants';

/**
 * Phase 4.1 (plan §4.1): the review-reminder sweep, worker-only.
 *
 * The job body is unchanged: it loads the configuration, finds published articles
 * whose review is due and persists one notification per recipient with the
 * `(article, reviewDueAt, user)` dedupe key it always used — so a duplicate run is
 * still a no-op rather than a second reminder.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: knowledgeBaseReviewReminderQueueName }),
    SettingsModule,
  ],
  providers: [
    KnowledgeBaseConfigurationLoader,
    KnowledgeBaseReviewReminderService,
    KnowledgeBaseReviewReminderProcessor,
    KnowledgeBaseReviewReminderSchedulerService,
  ],
})
export class KnowledgeBaseReviewReminderWorkerModule {}
