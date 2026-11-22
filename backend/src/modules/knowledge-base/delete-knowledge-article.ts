import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { requireChangeReason } from '../change-log/require-change-reason';
import {
  changeLogActions,
  recordKnowledgeArticleChange,
} from './record-knowledge-article-change';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';

/**
 * W7.88 (`BA-knowledge-base-15`): a hard delete is the end of an article's life,
 * so it now has an explicit tombstone policy instead of a bare `delete()`.
 *
 * The row is still removed — a knowledge article is not a legal record, and the
 * operator asking for deletion gets deletion — but the deletion now leaves a
 * **content-free tombstone** behind:
 *
 * - an audit-chain entry (`knowledge.article.deleted`) with the slug, the status,
 *   the placement, the owners and the **counters** the row carried
 *   (`feedbackCount`, `viewDays`, `viewCount`, `ratingCount`, `ratingSum`). The
 *   chain is hash-linked, so the fact of the deletion and the numbers survive even
 *   though the row, its feedback and its daily views are gone with it. No title and
 *   no body: the audit metadata may not outlive the content it describes;
 * - the usual knowledge change-log entry, whose snapshot keeps the title for the
 *   operator trail and is redacted by the `knowledgeContent` retention period once
 *   the article no longer exists (see the retention executor, W7.87 + W7.88);
 * - the in-app notification copies of the article lose their body (they already
 *   pointed at a page that no longer renders).
 *
 * Two gates keep the destructive path from destroying something still in use:
 *
 * 1. **Only a retired article may be deleted** — `ARCHIVED`, or one that was never
 *    published (`publishedAt === null`, i.e. a scratch draft). A `PUBLISHED` or
 *    `IN_REVIEW` article is refused with `ARTICLE_NOT_RETIRED`; the operator
 *    archives it first, which is reversible, stays audited and keeps the URL
 *    working while people may still arrive on it. A draft that *was* published is
 *    not "never published": it carries feedback and view history of its own.
 * 2. **Everything happens in one transaction** — the counters are read, the change
 *    log and the audit entry are written, the notification copies are emptied and
 *    the row is deleted together. A failing audit (an unregistered metadata key, a
 *    broken chain append) rolls the delete back instead of leaving a silent gap.
 *
 * Deliberately **not** in this package: a dedicated tombstone table that would also
 * reserve the slug for good (a new unique row needs a migration; the change log plus
 * the audit entry already carry the trail). Until then a deleted slug may be reused
 * by a new article — documented as a residual risk in the closeout.
 */
export async function deleteKnowledgeArticle(
  prisma: PrismaService,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
): Promise<void> {
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  assertDeletable(current);
  // Fail before the transaction if the operator sent no reason.
  const reason = requireChangeReason(input.reason);
  const deletedAt = new Date();

  await prisma.$transaction(async (transaction) => {
    // Snapshot the numbers the cascade is about to destroy. They are the only
    // record of the feedback an article had collected and of how often it was read.
    const [feedbackCount, viewDays] = await Promise.all([
      transaction.knowledgeFeedback.count({ where: { articleId: current.id } }),
      transaction.knowledgeArticleView.count({ where: { articleId: current.id } }),
    ]);

    await recordKnowledgeArticleChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      reason,
      before: current,
      after: current,
      actorUserId: context.actorUserId,
    });

    // A transaction client has no `$transaction` of its own, so the entry appends
    // into the caller's transaction and commits with the delete — or not at all.
    await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.knowledgeArticleDeleted,
      entityType: auditLogEntityTypes.knowledgeArticle,
      entityId: current.id,
      actorUserId: context.actorUserId,
      metadata: {
        slug: current.slug,
        status: current.status,
        classification: current.classification,
        serviceId: current.serviceId,
        organizationalUnitId: current.organizationalUnitId,
        ownerUserId: current.ownerUserId,
        reviewerUserId: current.reviewerUserId,
        feedbackCount,
        viewDays,
        viewCount: current.viewCount,
        ratingCount: current.ratingCount,
        ratingSum: current.ratingSum,
        reason,
        deletedAt: deletedAt.toISOString(),
      },
    });

    // The copies in people's inboxes must not keep the title of a page that is gone.
    await transaction.notification.updateMany({
      where: {
        payload: { path: ['articleId'], equals: current.id },
        body: { not: null },
      },
      data: { body: null },
    });

    await transaction.knowledgeArticle.delete({ where: { id: current.id } });
  });
}

/** `ARCHIVED`, or never published: anything else still has a live URL or a review to finish. */
function assertDeletable(article: KnowledgeArticleRecord): void {
  if (article.status === 'ARCHIVED' || article.publishedAt === null) return;
  throw new KnowledgeBaseError('ARTICLE_NOT_RETIRED');
}
