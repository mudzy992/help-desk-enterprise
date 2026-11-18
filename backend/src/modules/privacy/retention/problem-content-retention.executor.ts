import { DbNull } from '@prisma/client/runtime/client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { retentionRedactionMarker } from './retention-markers';
import type { RetentionBatch, RetentionExecutor, RetentionPreview } from './retention-executors';

/** Problems per batch: the redaction touches several tables per problem. */
const problemBatch = 50;

/**
 * W7.34 (BA-problems-16): retention for closed and cancelled problems.
 *
 * Until this executor existed nothing ever removed a problem: the record, its
 * events, its handoff reasons and the resolution-run messages stayed forever,
 * and only a physical delete (which the API does not offer) would cascade. The
 * policy follows the ticket rule:
 *
 * - the **skeleton** stays — number, status, dates, group, unit, service, the
 *   ticket/asset/incident links, the SLA-relevant timestamps — so reports,
 *   searches and the two `problems` reports keep their history;
 * - the **content** goes: title, description, root cause, 5-whys, workaround,
 *   resolution and the cancellation reason become the retention marker, the
 *   handoff reasons and the resolution-run message follow, event details are
 *   dropped (the action, the actor and the time stay);
 * - the **replicas** of that content go with it: in-app notifications that
 *   point at the problem (`payload.problemId`) and the knowledge article the
 *   problem created **while it is still a draft**. A published article is a
 *   governed knowledge asset of its own; silently rewriting it from a problem
 *   retention run would destroy content somebody published on purpose. That
 *   limit is documented rather than guessed at runtime.
 *
 * Idempotency without a schema change: a problem counts as done once its title
 * is the marker, so the marker itself is the "already redacted" state (a new
 * `contentRedactedAt` column would need a migration the package deliberately does
 * not take). Legal holds are respected the same way the ticket executor
 * does it: the owner, the creator, or any linked ticket under hold keeps the
 * whole problem intact.
 */
export function createProblemContentRetentionExecutor(prisma: PrismaClient): RetentionExecutor {
  const category = 'problemContent' as const;

  /** CLOSED after `closedAt`, CANCELLED after `cancelledAt`, not yet redacted, no hold. */
  function dueWhere(cutoff: Date) {
    return {
      OR: [
        { status: 'CLOSED' as const, closedAt: { lt: cutoff } },
        { status: 'CANCELLED' as const, cancelledAt: { lt: cutoff } },
      ],
      title: { not: retentionRedactionMarker },
      AND: [
        { OR: [{ ownerUserId: null }, { owner: { legalHoldAt: null } }] },
        { OR: [{ createdByUserId: null }, { createdBy: { legalHoldAt: null } }] },
        // A problem that quotes a held ticket must survive the ticket's own hold.
        { NOT: { tickets: { some: { ticket: { legalHoldAt: { not: null } } } } } },
      ],
    };
  }

  /** The closure instant the period counts from. */
  function closedAtOf(problem: { status: string; closedAt: Date | null; cancelledAt: Date | null }): Date | null {
    return problem.status === 'CANCELLED' ? problem.cancelledAt : problem.closedAt;
  }

  async function preview(cutoff: Date): Promise<RetentionPreview> {
    const where = dueWhere(cutoff);
    const [count, aggregate] = await Promise.all([
      prisma.problem.count({ where }),
      prisma.problem.findMany({
        where,
        select: { status: true, closedAt: true, cancelledAt: true },
        take: 5000,
      }),
    ]);
    const dates = aggregate
      .map((row) => closedAtOf(row))
      .filter((date): date is Date => date instanceof Date);
    return {
      count,
      bytes: 0n,
      oldestAt: dates.length === 0 ? null : new Date(Math.min(...dates.map((date) => date.getTime()))),
      newestAt: dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime()))),
    };
  }

  async function executeBatch(cutoff: Date): Promise<RetentionBatch> {
    const problems = await prisma.problem.findMany({
      where: dueWhere(cutoff),
      select: {
        id: true,
        sequence: true,
        status: true,
        closedAt: true,
        cancelledAt: true,
        knowledgeArticleId: true,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: problemBatch,
    });
    if (problems.length === 0) {
      return { items: 0, bytes: 0n, refs: [], oldestAt: null, newestAt: null, done: true, failures: 0 };
    }

    const ids = problems.map((problem) => problem.id);
    // Replicas are found by the pointer they stored, never by scanning content.
    const notifications = await prisma.notification.findMany({
      where: { OR: ids.map((id) => ({ payload: { path: ['problemId'], equals: id } })) },
      select: { id: true },
    });
    const articleIds = problems
      .map((problem) => problem.knowledgeArticleId)
      .filter((id): id is string => id !== null);

    await prisma.$transaction(async (transaction) => {
      await transaction.problem.updateMany({
        where: { id: { in: ids }, title: { not: retentionRedactionMarker } },
        data: {
          title: retentionRedactionMarker,
          description: retentionRedactionMarker,
          rootCause: null,
          rcaWhys: DbNull,
          workaround: null,
          workaroundAt: null,
          resolution: null,
          cancelReason: null,
        },
      });
      await transaction.problemEvent.updateMany({
        where: { problemId: { in: ids } },
        data: { detail: DbNull },
      });
      await transaction.problemHandoff.updateMany({
        where: { problemId: { in: ids } },
        data: { reason: retentionRedactionMarker, decisionReason: null },
      });
      await transaction.problemResolutionRun.updateMany({
        where: { problemId: { in: ids } },
        data: { message: retentionRedactionMarker, responseBody: DbNull, lastError: null },
      });
      if (notifications.length > 0) {
        await transaction.notification.updateMany({
          where: { id: { in: notifications.map((row) => row.id) } },
          data: { title: retentionRedactionMarker, body: null, payload: DbNull },
        });
      }
      if (articleIds.length > 0) {
        await transaction.knowledgeArticle.updateMany({
          where: { id: { in: articleIds }, status: 'DRAFT' },
          data: { title: retentionRedactionMarker, body: retentionRedactionMarker },
        });
      }
    });

    const dates = problems
      .map((problem) => closedAtOf(problem))
      .filter((date): date is Date => date instanceof Date);
    return {
      items: problems.length,
      bytes: 0n,
      // The problem number is derived from the sequence; the run row keeps it so
      // an operator can find the record without the content.
      refs: problems.map((problem) => `#${problem.sequence}`),
      oldestAt: dates.length === 0 ? null : new Date(Math.min(...dates.map((date) => date.getTime()))),
      newestAt: dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime()))),
      done: problems.length < problemBatch,
      failures: 0,
    };
  }

  return { category, preview, executeBatch };
}
