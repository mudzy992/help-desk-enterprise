import { Prisma, type PrismaClient } from '../../../generated/prisma/client';
import { changeLogEntityTypes } from '../../change-log/change-log.constants';
import { retentionRedactionMarker } from './retention-markers';
import type { RetentionBatch, RetentionExecutor, RetentionPreview } from './retention-executors';

/** Articles per batch: the redaction touches five tables per article. */
const knowledgeBatch = 100;

/**
 * W7.87 (`BA-knowledge-base-14`): retention for archived knowledge articles.
 *
 * An archived article had no retention at all: the body, the title, the comment
 * somebody wrote under it, the pointer to the ticket the draft was made from,
 * the change-log snapshots and the notification copies were kept forever. The
 * policy follows the problem and change rules:
 *
 * - the **skeleton** stays: the id and slug (deep links keep resolving), status,
 *   classification, the category/FAQ placement, service and organizational unit,
 *   owner, reviewer, the timestamps, `viewCount` and the rating counters — so
 *   reports and the audit trail keep their history;
 * - the **content** goes: `title` and `body` become the retention marker (the
 *   database trigger then rebuilds `searchVector` from them, so the old text is
 *   not searchable any more) and the `sourceTicketId`/`sourceMessageId` pointers
 *   into the ticket that produced the draft are cleared;
 * - the **replicas** go with it: the free-text feedback comments under the
 *   article are emptied (the rating, the helpful flag and the "handled" marker
 *   stay), the knowledge `ChangeLog` rows lose their reason and their `diff`
 *   snapshot (the snapshot stores the title), and the in-app notifications that
 *   copied the article lose their body;
 * - the **daily view rows** older than the cutoff are dropped: the aggregate
 *   `viewCount` on the article is the number reports use, the per-day rows are
 *   only relevant while they are recent.
 *
 * W7.88 adds the second half: **a deleted article leaves no text behind either**.
 * The delete path (W7.88 tombstone policy) keeps the article's title in its
 * knowledge change-log snapshot for the operator trail, and that row has no
 * article left to hang the `knowledgeContent` period on — the executor matched
 * articles, so the log of a deleted article was never redacted. The same batch now
 * also redacts `knowledge_article` change-log rows whose article no longer exists
 * (`NOT EXISTS`, one bounded query) once the row is older than the cutoff; their
 * ref is `deleted:{articleId}` because the slug is gone with the row.
 *
 * The period counts from `archivedAt` — the instant the article left the portal.
 * A legal hold on the owner or the reviewer keeps the article intact, exactly
 * like the problem and change executors. Idempotency needs no new column: an
 * article counts as done once its title is the marker, and the update carries
 * `title: { not: marker }` so a second pass writes nothing.
 */
export function createKnowledgeContentRetentionExecutor(
  prisma: PrismaClient,
): RetentionExecutor {
  const category = 'knowledgeContent' as const;

  /** Archived, past the period, not yet redacted, nobody involved under hold. */
  function dueWhere(cutoff: Date) {
    return {
      status: 'ARCHIVED' as const,
      archivedAt: { lt: cutoff },
      title: { not: retentionRedactionMarker },
      AND: [
        { OR: [{ ownerUserId: null }, { ownerUser: { legalHoldAt: null } }] },
        { OR: [{ reviewerUserId: null }, { reviewerUser: { legalHoldAt: null } }] },
      ],
    };
  }

  async function preview(cutoff: Date): Promise<RetentionPreview> {
    const where = dueWhere(cutoff);
    const [count, rows, orphans] = await Promise.all([
      prisma.knowledgeArticle.count({ where }),
      prisma.knowledgeArticle.findMany({
        where,
        select: { archivedAt: true },
        take: 5000,
      }),
      orphanChangeLogWindow(cutoff),
    ]);
    const dates = [
      ...rows
        .map((row) => row.archivedAt)
        .filter((date): date is Date => date instanceof Date)
        .map((date) => date.getTime()),
      ...orphans.dates.map((date) => date.getTime()),
    ];
    return {
      count: count + orphans.count,
      bytes: 0n,
      oldestAt: dates.length === 0 ? null : new Date(Math.min(...dates)),
      newestAt: dates.length === 0 ? null : new Date(Math.max(...dates)),
    };
  }

  /**
   * The knowledge change-log rows of articles that no longer exist: a deleted
   * article's trail, bounded to one batch and ordered so a long backlog drains.
   * Prisma cannot express `NOT EXISTS` across two models, so this is one raw query.
   */
  function orphanChangeLogFilter(cutoff: Date): Prisma.Sql {
    return Prisma.sql`
      WHERE c."entityType" = ${changeLogEntityTypes.knowledgeArticle}
        AND c."createdAt" < ${cutoff}
        AND c."reason" <> ${retentionRedactionMarker}
        AND NOT EXISTS (SELECT 1 FROM "KnowledgeArticle" a WHERE a."id" = c."entityId")`;
  }

  /** How many orphan replicas are due, and the window they cover. */
  async function orphanChangeLogWindow(
    cutoff: Date,
  ): Promise<{ count: number; dates: Date[] }> {
    const [row] = await prisma.$queryRaw<{ count: number; oldest: Date | null; newest: Date | null }[]>`
      SELECT count(*)::int AS "count", min(c."createdAt") AS "oldest", max(c."createdAt") AS "newest"
      FROM "ChangeLog" c${orphanChangeLogFilter(cutoff)}`;
    const dates: Date[] = [];
    if (row?.oldest instanceof Date) dates.push(row.oldest);
    if (row?.newest instanceof Date) dates.push(row.newest);
    return { count: Number(row?.count ?? 0), dates };
  }

  /** Up to one batch of orphan replicas, oldest first. */
  async function dueOrphanChangeLogs(
    cutoff: Date,
  ): Promise<{ id: string; entityId: string; createdAt: Date }[]> {
    return prisma.$queryRaw<{ id: string; entityId: string; createdAt: Date }[]>`
      SELECT c."id" AS "id", c."entityId" AS "entityId", c."createdAt" AS "createdAt"
      FROM "ChangeLog" c${orphanChangeLogFilter(cutoff)}
      ORDER BY c."createdAt" ASC, c."id" ASC
      LIMIT ${knowledgeBatch}`;
  }

  async function executeBatch(cutoff: Date): Promise<RetentionBatch> {
    const [articles, orphans] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where: dueWhere(cutoff),
        select: { id: true, slug: true, archivedAt: true },
        orderBy: [{ archivedAt: 'asc' }, { id: 'asc' }],
        take: knowledgeBatch,
      }),
      dueOrphanChangeLogs(cutoff),
    ]);
    if (articles.length === 0 && orphans.length === 0) {
      return { items: 0, bytes: 0n, refs: [], oldestAt: null, newestAt: null, done: true, failures: 0 };
    }

    const ids = articles.map((article) => article.id);
    // Replicas are found by the pointer they stored, never by scanning content.
    const notifications =
      ids.length === 0
        ? []
        : await prisma.notification.findMany({
            where: { OR: ids.map((id) => ({ payload: { path: ['articleId'], equals: id } })) },
            select: { id: true },
          });

    await prisma.$transaction(async (transaction) => {
      // A batch that only carries orphan replicas must not issue empty writes.
      if (ids.length > 0) {
        await transaction.knowledgeArticle.updateMany({
          where: { id: { in: ids }, title: { not: retentionRedactionMarker } },
          data: {
            title: retentionRedactionMarker,
            body: retentionRedactionMarker,
            sourceTicketId: null,
            sourceMessageId: null,
          },
        });
        await transaction.knowledgeFeedback.updateMany({
          where: { articleId: { in: ids }, comment: { not: null } },
          data: { comment: null },
        });
        await transaction.knowledgeArticleView.deleteMany({
          where: { articleId: { in: ids }, day: { lt: cutoff } },
        });
        await transaction.changeLog.updateMany({
          where: {
            entityType: changeLogEntityTypes.knowledgeArticle,
            entityId: { in: ids },
          },
          data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
        });
      }
      if (notifications.length > 0) {
        await transaction.notification.updateMany({
          where: { id: { in: notifications.map((row) => row.id) } },
          data: { body: null },
        });
      }
      // W7.88: the trail of an article that is already gone.
      if (orphans.length > 0) {
        await transaction.changeLog.updateMany({
          where: {
            id: { in: orphans.map((row) => row.id) },
            reason: { not: retentionRedactionMarker },
          },
          data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
        });
      }
    });

    const dates = [
      ...articles
        .map((article) => article.archivedAt)
        .filter((date): date is Date => date instanceof Date)
        .map((date) => date.getTime()),
      ...orphans
        .map((row) => row.createdAt)
        .filter((date) => date instanceof Date)
        .map((date) => date.getTime()),
    ];
    return {
      items: articles.length + orphans.length,
      bytes: 0n,
      refs: [
        // The slug identifies the article for an operator without the text.
        ...articles.map((article) => article.slug),
        // A deleted article has no slug left to show: name the row it came from.
        ...new Set(orphans.map((row) => `deleted:${row.entityId}`)),
      ],
      oldestAt: dates.length === 0 ? null : new Date(Math.min(...dates)),
      newestAt: dates.length === 0 ? null : new Date(Math.max(...dates)),
      // A full batch in either half means there is more to drain.
      done: articles.length < knowledgeBatch && orphans.length < knowledgeBatch,
      failures: 0,
    };
  }

  return { category, preview, executeBatch };
}
