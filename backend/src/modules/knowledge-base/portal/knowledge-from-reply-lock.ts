import type { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { DatabaseLockService } from '../../../common/database-lock/database-lock.service';
import type { KnowledgeArticleRecord } from '../knowledge-base.types';
import { toArticleRecord } from '../load-knowledge-article';

const databaseLocks = new DatabaseLockService();
const fromReplyLockNamespace = 'knowledge-base.from-reply';

/**
 * W7.82 (`BA-knowledge-base-08`): one reply may produce at most **one** draft.
 *
 * `KnowledgeArticle` has no unique key over `(sourceTicketId, sourceMessageId)` and adding one is a migration, so
 * the writers of the same reply are serialized on an advisory lock inside the caller's transaction: the second
 * writer waits, then finds the draft the first one committed instead of creating a twin. The lock is transactional
 * (`pg_advisory_xact_lock`), so it is released on commit, on rollback and on a dropped connection — a crashed
 * request cannot leave a stuck key behind.
 */
export function withKnowledgeFromReplyLock<T>(
  transaction: Prisma.TransactionClient,
  ticketId: string,
  messageId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return databaseLocks.withAdvisoryLock(
    transaction,
    { namespace: fromReplyLockNamespace, key: `${ticketId}:${messageId}` },
    operation,
  );
}

/**
 * The draft this reply already produced, if any.
 *
 * `findMany({ take: 1 })` is used instead of `findFirst` on purpose: the in-memory double that backs the unit
 * specs models `findMany`, and a second, divergent lookup path would mean the spec proves something the
 * production query does not do. The columns carry no index (that would be a migration), so this is a bounded
 * scan on a path an agent triggers once per reply — documented as the follow-up index in the closeout.
 */
export async function findKnowledgeDraftFromReply(
  client: PrismaService,
  ticketId: string,
  messageId: string,
): Promise<KnowledgeArticleRecord | null> {
  const rows = await client.knowledgeArticle.findMany({
    where: { sourceTicketId: ticketId, sourceMessageId: messageId },
    take: 1,
  });
  const [row] = rows;
  return row === undefined ? null : toArticleRecord(row);
}
