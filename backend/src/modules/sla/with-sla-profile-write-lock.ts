import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Serializes invariant checks and writes for one SLA profile. */
export async function withSlaProfileWriteLock<T>(
  prisma: PrismaService,
  slaProfileId: string,
  work: (client: PrismaService) => Promise<T>,
): Promise<T> {
  if (!supportsTransactions(prisma)) return work(prisma);
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sla-profile:' + slaProfileId}, 0))`,
    );
    return work(transaction as unknown as PrismaService);
  });
}

function supportsTransactions(prisma: PrismaService): prisma is PrismaService & {
  $transaction: <T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
} {
  return typeof (prisma as unknown as { $transaction?: unknown }).$transaction === 'function' &&
    typeof (prisma as unknown as { $executeRaw?: unknown }).$executeRaw === 'function' &&
    typeof (prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function';
}
