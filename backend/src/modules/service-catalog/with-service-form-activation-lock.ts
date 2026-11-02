import type { Prisma } from '../../generated/prisma/client';
import { DatabaseLockService } from '../../common/database-lock/database-lock.service';

const databaseLocks = new DatabaseLockService();
const activationLockNamespace = 'service-catalog.form-activation';

/** Serialize activation mutations per service, including installer seeding. */
export function withServiceFormActivationLock<T>(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return databaseLocks.withAdvisoryLock(
    transaction,
    { namespace: activationLockNamespace, key: serviceId },
    async () => {
      // Config snapshot apply takes SHARE ROW EXCLUSIVE on FormVersion before
      // row locks. Acquire the compatible writer lock first so an activation
      // never holds a FormVersion row while waiting behind that table lock.
      await transaction.$executeRaw`
        LOCK TABLE "FormVersion" IN ROW EXCLUSIVE MODE
      `;
      return operation();
    },
  );
}
