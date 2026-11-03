import type { Prisma } from '../../generated/prisma/client';
import { DatabaseLockService } from '../../common/database-lock/database-lock.service';

const databaseLocks = new DatabaseLockService();
const downtimeWindowLockNamespace = 'service-catalog.downtime-window';

/** Serialize overlap-sensitive downtime writes for one service. */
export function withServiceDowntimeWindowMutationLock<T>(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withServiceDowntimeWindowMutationLocks(
    transaction,
    [serviceId],
    operation,
  );
}

/** Acquire a stable lock set for multi-service change-schedule sync writes. */
export function withServiceDowntimeWindowMutationLocks<T>(
  transaction: Prisma.TransactionClient,
  serviceIds: readonly string[],
  operation: () => Promise<T>,
): Promise<T> {
  const orderedServiceIds = [...new Set(serviceIds)].sort();

  const acquireNext = (index: number): Promise<T> => {
    const serviceId = orderedServiceIds[index];
    if (serviceId === undefined) return operation();

    return databaseLocks.withAdvisoryLock(
      transaction,
      { namespace: downtimeWindowLockNamespace, key: serviceId },
      () => acquireNext(index + 1),
    );
  };

  return acquireNext(0);
}
