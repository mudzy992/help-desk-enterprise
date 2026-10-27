import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Serializes every SLA state writer for one ticket for the full read/evaluate/write cycle. */
export async function withTicketSlaWriteLock<T>(
  prisma: PrismaService,
  ticketId: string,
  work: (client: PrismaService, transaction?: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!supportsCoordinatedTransaction(prisma)) {
    return work(prisma);
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${ticketId}, 0))`,
    );
    return work(transaction as unknown as PrismaService, transaction);
  });
}

function supportsCoordinatedTransaction(
  prisma: PrismaService,
): prisma is PrismaService & {
  $transaction: <T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
} {
  return (
    typeof (prisma as unknown as { $transaction?: unknown }).$transaction === 'function' &&
    typeof (prisma as unknown as { $executeRaw?: unknown }).$executeRaw === 'function'
  );
}
