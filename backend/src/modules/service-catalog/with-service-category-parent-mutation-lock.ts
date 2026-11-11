import type { Prisma } from '../../generated/prisma/client';
import { DatabaseLockService } from '../../common/database-lock/database-lock.service';
import {
  DatabaseLockError,
  databaseLockErrorCodes,
} from '../../common/database-lock/database-lock.error';
import { ServiceCatalogError } from './service-catalog.error';

const databaseLocks = new DatabaseLockService();
const categoryTreeLockIdentity = {
  namespace: 'service-catalog.category-tree',
  key: 'parent-hierarchy',
} as const;

/** Serialize category-edge writers against one shared hierarchy snapshot. */
export async function withServiceCategoryParentMutationLock<T>(
  transaction: Prisma.TransactionClient,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await databaseLocks.withAdvisoryLock(
      transaction,
      categoryTreeLockIdentity,
      operation,
    );
  } catch (error) {
    if (
      error instanceof DatabaseLockError &&
      error.code === databaseLockErrorCodes.timeout
    ) {
      throw new ServiceCatalogError('CATEGORY_TREE_LOCK_UNAVAILABLE');
    }
    throw error;
  }
}
