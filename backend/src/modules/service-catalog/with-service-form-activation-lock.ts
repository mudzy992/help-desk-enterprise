import type { Prisma } from '../../generated/prisma/client';
import { DatabaseLockService } from '../../common/database-lock/database-lock.service';

const databaseLocks = new DatabaseLockService();
// Retain the BA-05 namespace so old and new writers still serialize during rollout.
const formVersionMutationLockNamespace = 'service-catalog.form-activation';

/** Serialize all service form-version writes and preserve snapshot lock ordering. */
export function withServiceFormVersionMutationLock<T>(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return databaseLocks.withAdvisoryLock(
    transaction,
    { namespace: formVersionMutationLockNamespace, key: serviceId },
    async () => {
      // Config snapshot apply takes SHARE ROW EXCLUSIVE on FormVersion before
      // row locks. Acquire the compatible writer lock first so this mutation
      // never holds a FormVersion row while waiting behind that table lock.
      await transaction.$executeRaw`
        LOCK TABLE "FormVersion" IN ROW EXCLUSIVE MODE
      `;
      return operation();
    },
  );
}

export const withServiceFormActivationLock =
  withServiceFormVersionMutationLock;
