import type { Prisma } from '../../../generated/prisma/client';
import { DatabaseLockService } from '../../../common/database-lock/database-lock.service';

const databaseLocks = new DatabaseLockService();
const categoryMembershipLockNamespace = 'knowledge-base.category-membership';

/**
 * W7.84 (`BA-knowledge-base-10`): "a category is never archived while it still holds live content" and "an
 * article is never placed into an archived category" are two halves of one invariant, and each half was decided by
 * a count-then-write on its own side: the archive guard counted the articles of a category and then archived it,
 * while a placement checked that the category was active and then wrote. Both can pass their own check in the same
 * instant, leaving an archived category with a visible article inside it.
 *
 * Both sides now take the same transactional advisory lock keyed on the category, so whichever of the two commits
 * first is the state the other one sees: the archive guard either counts the placed article (and refuses) or the
 * placement finds an archived category (and refuses). `pg_advisory_xact_lock` is held until the surrounding
 * transaction ends, so the protection covers everything that transaction writes, not just the call that took it.
 *
 * Ids are locked in sorted order and de-duplicated: a caller that touches two categories can never deadlock with
 * another caller that touches the same two in the opposite order.
 */
export async function withKnowledgeCategoryMembershipLock<T>(
  transaction: Prisma.TransactionClient | undefined,
  categoryIds: readonly (string | null | undefined)[],
  operation: () => Promise<T>,
): Promise<T> {
  const ids = [
    ...new Set(
      categoryIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      ),
    ),
  ].sort();
  // Without a transaction there is nothing to hang the lock on: the caller is responsible for wrapping the whole
  // decision. The portal always passes one (see `KnowledgePortalService`).
  if (transaction === undefined || ids.length === 0) {
    return operation();
  }
  for (const categoryId of ids) {
    await databaseLocks.withAdvisoryLock(
      transaction,
      { namespace: categoryMembershipLockNamespace, key: categoryId },
      async () => undefined,
    );
  }
  return operation();
}
