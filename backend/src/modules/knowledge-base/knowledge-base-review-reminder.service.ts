import { Injectable, Logger, Optional } from '@nestjs/common';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../notifications/notifications.constants';
import type { NotificationPayload } from '../notifications/notifications.types';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { toArticleRecord } from './load-knowledge-article';
import { loadKnowledgeArticleScope } from './load-knowledge-article-scope';
import {
  createReminderEligibilityCaches,
  resolveReviewReminderRecipients,
} from './review-reminder-recipients';

@Injectable()
export class KnowledgeBaseReviewReminderService {
  private readonly logger = new Logger(KnowledgeBaseReviewReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
    private readonly loader: AuthorizationContextLoader,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}


  async processDue(now = new Date()): Promise<number> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.reviewCycleEnabled) {
      return 0;
    }
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    const windowEnd = new Date(
      now.getTime() +
        configuration.remindDaysBefore * 24 * 60 * 60 * 1000,
    );
    // W7.85 (`BA-knowledge-base-12`): the sweep used to load every due article at once. It now walks the backlog
    // in bounded, stably ordered batches (most overdue first): memory stays flat however large the backlog is, a
    // slow owner group cannot starve the rest of the queue, and one run stops after a bounded number of batches
    // instead of running away.
    const caches = createReminderEligibilityCaches();
    let sent = 0;
    let cursor: string | undefined;
    for (
      let batch = 0;
      batch < knowledgeBaseConstants.reminderMaximumBatches;
      batch += 1
    ) {
      const rows = await this.prisma.knowledgeArticle.findMany({
        where: {
          status: 'PUBLISHED',
          reviewDueAt: { not: null, lte: windowEnd },
        },
        orderBy: [{ reviewDueAt: 'asc' }, { id: 'asc' }],
        take: knowledgeBaseConstants.reminderCandidateBatchSize,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const article = toArticleRecord(row);
        if (article.reviewDueAt === null) {
          continue;
        }
        // Who can still act on this article: active accounts with a current `knowledge.article.write` in its
        // OU and service. An article whose owner lost the permission is reported instead of silently ignored.
        let recipients: readonly string[];
        try {
          const scope = await loadKnowledgeArticleScope(this.prisma, article);
          recipients = await resolveReviewReminderRecipients({
            prisma: this.prisma,
            loader: this.loader,
            article,
            scope,
            caches,
          });
        } catch (error) {
          this.logger.warn(
            `knowledge review reminder: article ${article.id} has no resolvable scope (${String(error)})`,
          );
          continue;
        }
        if (recipients.length === 0) {
          this.logger.warn(
            `knowledge review reminder: article ${article.id} has no eligible recipient (owner ${article.ownerUserId ?? 'none'}, group ${article.ownerGroupId ?? 'none'})`,
          );
          continue;
        }
        const dedupeKey = `kb-review:${article.id}:${article.reviewDueAt.toISOString()}`;
        for (const userId of recipients) {
          // Package 5.2.4 (M14 B2): the reminder is KB-scoped, not ticket-scoped.
          // Use articleId/articleSlug in payload and do not stuff them into the
          // ticket fields, so click routing lands on the KB admin page.
          const created = await persistInAppNotification(
            this.prisma,
            {
              userId,
              type: notificationTypes.knowledgeReviewDue,
              title: 'Znanje za pregled',
              body: `Članak "${article.title}" (${article.slug}) dospijeva na pregled — osvježi ga ili produži rok.`,
              ticketId: null,
              payload: {
                ticketId: null,
                ticketNumber: null,
                articleId: article.id,
                articleSlug: article.slug,
                event: notificationTypes.knowledgeReviewDue,
                messageId: dedupeKey,
                actorUserId: null,
                confidential: false,
              } satisfies NotificationPayload,
              dedupeKey: `${dedupeKey}:${userId}`,
            },
            policy,
          );
          if (created !== null) {
            sent += 1;
          }
        }
      }
      cursor = rows[rows.length - 1]?.id;
      if (rows.length < knowledgeBaseConstants.reminderCandidateBatchSize) {
        break;
      }
    }
    return sent;
  }
}
