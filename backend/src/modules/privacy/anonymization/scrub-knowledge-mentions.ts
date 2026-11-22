import type { PrismaService } from '../../../common/prisma/prisma.service';
import { collectKnowledgeMentions, knowledgeMentionTokens } from './knowledge-mentions';
import type { TextScrubber } from './text-scrubber';

export type KnowledgeMentionCounts = {
  readonly knowledgeArticles: number;
  readonly knowledgeFeedbacks: number;
  readonly knowledgeNotifications: number;
  readonly knowledgeChangeLogs: number;
  readonly knowledgeSourceLinks: number;
  readonly knowledgeIntercepts: number;
};

const empty: KnowledgeMentionCounts = {
  knowledgeArticles: 0,
  knowledgeFeedbacks: 0,
  knowledgeNotifications: 0,
  knowledgeChangeLogs: 0,
  knowledgeSourceLinks: 0,
  knowledgeIntercepts: 0,
};

/**
 * W7.87 (`BA-knowledge-base-14`): the knowledge-base part of an anonymisation.
 *
 * Covered readers:
 *
 * - **articles** the person owns, reviews or is only named in — the scrubber
 *   replaces the identifiers in `title` and `body`, and the search vector is
 *   refreshed by the database trigger on the same update, so the old name cannot
 *   be found through search either;
 * - **comments**: their own feedback text is personal data and is removed, while
 *   somebody else's comment that names them is scrubbed (the rating and the
 *   "handled" marker stay, because they are not personal data);
 * - **in-app notifications** that copied an affected article — a scrubbed
 *   article whose copy in somebody's inbox still names the person is not an
 *   erasure;
 * - **change-log replicas**: the knowledge change log stores `title` snapshots
 *   (`toKnowledgeArticleSnapshot`), so the history is scrubbed with the article;
 * - **source pointers**: an article drafted from one of the person's tickets
 *   keeps `sourceTicketId`/`sourceMessageId`; those are pointers into the erased
 *   ticket history and are cleared;
 * - **intercept history**: `KnowledgeInterceptResolution` is the person's own
 *   browsing of the portal (which article was offered against which ticket). It
 *   is not content for anybody else and goes with the person.
 *
 * Idempotent: every step matches only rows that still contain something, so a
 * second pass changes nothing.
 */
export async function scrubKnowledgeMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
  readonly scrubber: TextScrubber;
  /** Tickets of the person; articles drafted from them lose the pointer. */
  readonly linkedTicketIds: readonly string[];
}): Promise<KnowledgeMentionCounts> {
  const { prisma, userId, scrubber, linkedTicketIds } = input;
  const scope = await collectKnowledgeMentions({
    prisma,
    userId,
    tokens: knowledgeMentionTokens(scrubber.identifiers),
    linkedTicketIds,
  });

  let changedArticles = 0;
  for (const article of scope.articles) {
    const title = scrubber.scrub(article.title);
    const body = scrubber.scrub(article.body);
    if (title.count + body.count === 0) continue;
    await prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { title: title.text, body: body.text },
    });
    changedArticles += 1;
  }

  let changedFeedbacks = 0;
  for (const feedback of scope.feedbacks) {
    if (feedback.comment === null) continue;
    if (feedback.userId === userId) {
      // Their own words: nothing of value remains after removing the author.
      await prisma.knowledgeFeedback.update({
        where: { id: feedback.id },
        data: { comment: null },
      });
      changedFeedbacks += 1;
      continue;
    }
    const comment = scrubber.scrub(feedback.comment);
    if (comment.count === 0) continue;
    await prisma.knowledgeFeedback.update({
      where: { id: feedback.id },
      data: { comment: comment.text },
    });
    changedFeedbacks += 1;
  }

  let changedNotifications = 0;
  for (const notification of scope.notifications) {
    const title = scrubber.scrub(notification.title);
    const body = notification.body === null ? null : scrubber.scrub(notification.body);
    const payload = scrubber.scrubJson(notification.payload);
    if (title.count + (body?.count ?? 0) + payload.count === 0) continue;
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        title: title.text,
        body: body?.text ?? null,
        ...(payload.count > 0 ? { payload: payload.value as never } : {}),
      },
    });
    changedNotifications += 1;
  }

  let changedChangeLogs = 0;
  for (const entry of scope.changeLogs) {
    const reason = scrubber.scrub(entry.reason);
    const diff = scrubber.scrubJson(entry.diff);
    if (reason.count + diff.count === 0) continue;
    await prisma.changeLog.update({
      where: { id: entry.id },
      data: {
        reason: reason.text,
        ...(diff.count > 0 ? { diff: diff.value as never } : {}),
      },
    });
    changedChangeLogs += 1;
  }

  let changedSources = 0;
  if (scope.sourcedArticles.length > 0) {
    const updated = await prisma.knowledgeArticle.updateMany({
      where: { id: { in: scope.sourcedArticles.map((article) => article.id) } },
      data: { sourceTicketId: null, sourceMessageId: null },
    });
    changedSources = updated.count;
  }

  const intercepts = await prisma.knowledgeInterceptResolution.deleteMany({
    where: { userId },
  });

  if (
    changedArticles +
      changedFeedbacks +
      changedNotifications +
      changedChangeLogs +
      changedSources +
      intercepts.count ===
    0
  ) {
    return empty;
  }
  return {
    knowledgeArticles: changedArticles,
    knowledgeFeedbacks: changedFeedbacks,
    knowledgeNotifications: changedNotifications,
    knowledgeChangeLogs: changedChangeLogs,
    knowledgeSourceLinks: changedSources,
    knowledgeIntercepts: intercepts.count,
  };
}
