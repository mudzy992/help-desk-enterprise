import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../notifications/notifications.constants';
import type { NotificationPayload } from '../notifications/notifications.types';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { toArticleRecord } from './load-knowledge-article';
import { loadOwnerGroupMemberUserIds } from './load-knowledge-article-scope';

@Injectable()
export class KnowledgeBaseReviewReminderService {
  private readonly logger = new Logger(KnowledgeBaseReviewReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
  ) {}


  async processDue(now = new Date()): Promise<number> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.reviewCycleEnabled) {
      return 0;
    }
    const windowEnd = new Date(
      now.getTime() +
        configuration.remindDaysBefore * 24 * 60 * 60 * 1000,
    );
    const candidates = await this.prisma.knowledgeArticle.findMany({
      where: {
        status: 'PUBLISHED',
        reviewDueAt: { not: null, lte: windowEnd },
      },
    });
    let sent = 0;
    for (const row of candidates) {
      const article = toArticleRecord(row);
      if (article.reviewDueAt === null) {
        continue;
      }
      const recipients = await resolveOwnerRecipients(this.prisma, article);
      const dedupeKey = `kb-review:${article.id}:${article.reviewDueAt.toISOString()}`;
      for (const userId of recipients) {
        const created = await persistInAppNotification(this.prisma, {
          userId,
          type: notificationTypes.knowledgeReviewDue,
          title: 'notifications.items.knowledgeReviewDue',
          body: article.title,
          ticketId: null,
          payload: {
            ticketId: article.id,
            ticketNumber: article.slug,
            event: notificationTypes.knowledgeReviewDue,
            messageId: dedupeKey,
            actorUserId: null,
            confidential: false,
          } satisfies NotificationPayload,
          dedupeKey: `${dedupeKey}:${userId}`,
        });
        if (created !== null) {
          sent += 1;
        }
      }
    }
    return sent;
  }
}

async function resolveOwnerRecipients(
  prisma: PrismaService,
  article: {
    readonly ownerUserId: string | null;
    readonly ownerGroupId: string | null;
  },
): Promise<readonly string[]> {
  if (article.ownerUserId !== null) {
    return [article.ownerUserId];
  }
  const members = await loadOwnerGroupMemberUserIds(
    prisma,
    article.ownerGroupId,
  );
  return [...members];
}
