import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export function runSavedViewOwnerTransaction<T>(
  prisma: PrismaService,
  userId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (transaction) => {
    if (typeof transaction.$queryRaw === 'function') {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'saved-view:' + userId}))`;
    }
    return operation(transaction);
  });
}

export function isSavedViewUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}
