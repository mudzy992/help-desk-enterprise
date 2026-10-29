import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Makes one starting profile (profile, rules, escalation ladder and audit rows)
 * a single repairable unit and serializes concurrent application starts by key.
 */
export async function withStartingSlaProfileSeedLock<T>(
  prisma: PrismaService,
  profileKey: string,
  work: (client: PrismaService) => Promise<T>,
): Promise<T> {
  if (!supportsDatabaseTransactions(prisma)) return work(prisma);
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sla-starting-profile:' + profileKey}, 0))`,
    );
    return work(transaction as unknown as PrismaService);
  });
}

function supportsDatabaseTransactions(prisma: PrismaService): boolean {
  const candidate = prisma as unknown as Record<string, unknown>;
  return typeof candidate.$transaction === 'function' &&
    typeof candidate.$executeRaw === 'function' &&
    typeof candidate.$queryRaw === 'function';
}
